const query = `
  query GetOrgSponsors($after: String) {
    organization(login: "jsdelivr") {
			name
			createdAt
			email
			isVerified
      sponsorshipsAsMaintainer(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
						id
						isActive
						isOneTimePayment
						createdAt
						tierSelectedAt
						tier {
							createdAt
							id
							isCustomAmount
							isOneTime
							monthlyPriceInDollars
							name
							updatedAt
						}
					}
        }
      }
    }
  }
`;

const requestGithub = async ({ env }, cursor = null) => {
	const response = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env['GITHUB_ACCESS_TOKEN']}`,
		},
		body: JSON.stringify({
			query,
			variables: { after: cursor },
		}),
	});

	if (response.ok) {
		const responseData = await response.json();
		const pageInfo = responseData.data.organization.sponsorshipsAsMaintainer.pageInfo;
		const edges = responseData.data.organization.sponsorshipsAsMaintainer.edges;

		if (pageInfo.hasNextPage) {
			const endCursor = pageInfo.endCursor;
			const nodes = edges.map((edge) => edge.node);

			const nextPageData = await requestGithub(query, endCursor);
			return {
				hasNextPage: nextPageData.hasNextPage,
				nodes: [...nodes, ...nextPageData.nodes],
			};
		} else {
			const nodes = edges.map((edge) => edge.node);
			return {
				hasNextPage: pageInfo.hasNextPage,
				nodes,
			};
		}
	} else {
		throw new Error(`${response.status} ${response.statusText}`);
	}
}

export const fetchAllSponsors = async ({ env }) => {
    const data = await requestGithub({ env });
    return data.nodes;
}

const sponsors = await fetchAllSponsors({ env: process.env });
console.log('sponsors', sponsors);
