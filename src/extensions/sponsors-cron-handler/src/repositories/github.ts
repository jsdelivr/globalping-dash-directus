import { OperationContext } from '@directus/types';
import axios from 'axios';
import { GithubSponsor } from "../types";

type GithubResponse = {
	data: {
		organization: {
			sponsorshipsAsMaintainer: {
				pageInfo: {
					hasNextPage: boolean;
					endCursor: string;
				},
				edges: {
					node: {
						sponsorEntity: {
							login: string;
							databaseId: number;
						},
						isActive: boolean;
						isOneTimePayment: boolean;
						tier: {
							monthlyPriceInDollars: number;
						}
					}
				}[]
			}
		}
	}
};

const query = `
	query GetOrgSponsors($after: String) {
		organization(login: "jsdelivr") {
			sponsorshipsAsMaintainer(first: 100, after: $after) {
				pageInfo {
					hasNextPage
					endCursor
				}
				edges {
					node {
						sponsorEntity {
							... on User {
								login,
								databaseId
							}
							... on Organization {
								login,
								databaseId
							}
						}
						isActive
						isOneTimePayment
						tier {
							monthlyPriceInDollars
						}
					}
				}
			}
		}
	}
`;

export const getGithubSponsors = async ({ env }: { env: OperationContext['env'] }): Promise<GithubSponsor[]> => {
	let nodes: GithubSponsor[] = [];
	let hasNextPage = true;
	let cursor: string | null = null;

	while (hasNextPage) {
		const response = await axios.post('https://api.github.com/graphql', {
			query,
			variables: { after: cursor },
		}, {
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
			},
		});

		if (response.status === 200) {
			const responseData = response.data as GithubResponse;
			const pageInfo = responseData.data.organization.sponsorshipsAsMaintainer.pageInfo;
			const edges = responseData.data.organization.sponsorshipsAsMaintainer.edges;

			const newNodes: GithubSponsor[] = edges.map((edge) => edge.node).map(node => ({
				githubLogin: node.sponsorEntity.login,
				githubId: node.sponsorEntity.databaseId.toString(),
				isActive: node.isActive,
				isOneTimePayment: node.isOneTimePayment,
				monthlyAmount: node.tier.monthlyPriceInDollars,
			}));

			nodes.push(...newNodes);
			hasNextPage = pageInfo.hasNextPage;
			cursor = pageInfo.endCursor;
		} else {
			throw new Error(`Request failed with status ${response.status}`);
		}
	}

	return nodes;
};

