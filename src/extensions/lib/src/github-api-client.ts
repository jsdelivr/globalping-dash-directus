import { createError, ErrorCode } from '@directus/errors';
import axios from 'axios';

type User = {
	external_identifier: string | null;
	github_oauth_token: string | null;
};

type GithubUserResponse = {
	login: string;
};

type GithubOrg = {
	id: number;
	login: string;
};

type GithubMembership = {
	state: string;
	role: string;
	organization: GithubOrg;
};

export type GithubOrganization = {
	githubId: string;
	login: string;
	role: 'admin' | 'member';
};

export const githubSyncError = (status?: number) => new (createError(
	ErrorCode.InvalidToken,
	`Failed to get the GitHub data${status ? ` (${status})` : ''}. Please sign out and sign in again.`,
	400,
))();

const githubRequest = <T>(path: string, token: string | null) => {
	return axios.get<T>(`https://api.github.com${path}`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
};

// Paginate the list to get all items.
const githubListRequest = async <T>(path: string, token: string | null): Promise<T[]> => {
	const items: T[] = [];

	for (let page = 1; ; page++) {
		const response = await githubRequest<T[]>(`${path}?per_page=100&page=${page}`, token);
		items.push(...response.data);

		if (!response.headers['link']?.includes('rel="next"')) {
			return items;
		}
	}
};

const toOrganization = (org: { id: number; login: string }, role: 'admin' | 'member'): GithubOrganization => ({
	githubId: org.id.toString(),
	login: org.login,
	role,
});

// Both sources are incomplete on their own: the memberships list is the only one with roles and private memberships, but orgs
// restricting our OAuth app are silently missing from it. Those are visible in the public list, without a role, so they become members.
export const getGithubOrganizations = async (user: User): Promise<GithubOrganization[]> => {
	const [ memberships, publicOrgs ] = await Promise.all([
		githubListRequest<GithubMembership>('/user/memberships/orgs', user.github_oauth_token),
		// Public memberships of any user, so this one also lists the orgs restricting our OAuth app.
		githubListRequest<GithubOrg>(`/user/${user.external_identifier}/orgs`, user.github_oauth_token),
	]).catch((error) => {
		throw githubSyncError(error.response?.status);
	});

	const organizations = memberships
		.filter(membership => membership.state === 'active')
		// GitHub also has the `billing_manager` role, which is treated as `member`.
		.map(membership => toOrganization(membership.organization, membership.role === 'admin' ? 'admin' : 'member'));

	const knownIds = new Set(organizations.map(org => org.githubId));

	return [
		...organizations,
		...publicOrgs.filter(org => !knownIds.has(org.id.toString())).map(org => toOrganization(org, 'member')),
	];
};

export const getGithubUsername = async (user: User): Promise<string> => {
	const response = await githubRequest<GithubUserResponse>(`/user/${user.external_identifier}`, user.github_oauth_token)
		.catch((error) => {
			throw githubSyncError(error.response?.status);
		});

	return response.data.login;
};
