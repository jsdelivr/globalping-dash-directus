import { OperationContext } from '@directus/types';
import { graphql } from '@octokit/graphql';
import nodeFetch from 'node-fetch';
import { GithubSponsor } from '../types';

type GithubResponse = {
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
	const nodes: GithubSponsor[] = [];
	let hasNextPage = true;
	let cursor: string | null = null;

	while (hasNextPage) {
		const response: GithubResponse = await graphql(query, {
			headers: {
				Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
			},
			after: cursor,
			request: {
				fetch: globalThis.fetch ?? nodeFetch, // Using node-fetch for tests and native fetch in prod as nock doesn't support native fetch right now.
			},
		});

		const pageInfo = response.organization.sponsorshipsAsMaintainer.pageInfo;
		const edges = response.organization.sponsorshipsAsMaintainer.edges;

		const newNodes: GithubSponsor[] = edges.map(edge => edge.node).map(node => ({
			githubLogin: node.sponsorEntity.login,
			githubId: node.sponsorEntity.databaseId.toString(),
			isActive: node.isActive,
			isOneTimePayment: node.isOneTimePayment,
			monthlyAmount: node.tier.monthlyPriceInDollars,
		}));

		nodes.push(...newNodes);
		hasNextPage = pageInfo.hasNextPage;
		cursor = pageInfo.endCursor;
	}

	return nodes;
};

