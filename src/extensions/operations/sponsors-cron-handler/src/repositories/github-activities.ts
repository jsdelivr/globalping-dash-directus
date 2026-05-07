import type { OperationContext } from '@directus/extensions';
import { graphql } from '@octokit/graphql';
import type { GithubActivity } from '../types.js';

type GithubResponse = {
	organization: {
		sponsorsActivities: {
			pageInfo: {
				hasNextPage: boolean;
				endCursor: string | null;
			};
			nodes: GithubActivity[];
		};
	};
};

const query = `
	query GetSponsorActivities($after: String, $since: DateTime, $until: DateTime) {
		organization(login: "jsdelivr") {
			sponsorsActivities(
				first: 100,
				after: $after,
				since: $since,
				until: $until,
				actions: [NEW_SPONSORSHIP, TIER_CHANGE],
				orderBy: { field: TIMESTAMP, direction: ASC }
			) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					id
					action
					timestamp
					sponsor {
						... on User { databaseId login }
						... on Organization { databaseId login }
					}
					sponsorsTier {
						id
						monthlyPriceInDollars
						isOneTime
					}
					previousSponsorsTier {
						monthlyPriceInDollars
					}
				}
			}
		}
	}
`;

export const getGithubSponsorActivities = async (since: number, until: number, { env }: OperationContext): Promise<GithubActivity[]> => {
	const nodes: GithubActivity[] = [];
	let hasNextPage = true;
	let cursor: string | null = null;

	while (hasNextPage) {
		const response: GithubResponse = await graphql(query, {
			headers: {
				Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
			},
			since: new Date(since).toISOString(),
			until: new Date(until).toISOString(),
			after: cursor,
		});

		const pageInfo = response.organization.sponsorsActivities.pageInfo;
		const newNodes = response.organization.sponsorsActivities.nodes;

		nodes.push(...newNodes);
		hasNextPage = pageInfo.hasNextPage;
		cursor = pageInfo.endCursor;
	}

	// Drop tier downgrades — no additions ever gets created for them.
	return nodes.filter((node) => {
		if (node.action === 'TIER_CHANGE' && node.previousSponsorsTier.monthlyPriceInDollars >= node.sponsorsTier.monthlyPriceInDollars) {
			return false;
		}

		return true;
	});
};
