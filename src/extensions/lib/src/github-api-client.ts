import { createError, ErrorCode } from '@directus/errors';
import axios from 'axios';

type User = {
	external_identifier: string | null;
	github_oauth_token: string | null;
};

type GithubUserResponse = {
	login: string;
};

type GithubOrgsResponse = {
	id: number;
	login: string;
}[];

type GithubMembershipsResponse = {
	state: string;
	role: string;
	organization: {
		id: number;
		login: string;
	};
}[];

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

const toOrganization = (org: { id: number; login: string }, role: 'admin' | 'member'): GithubOrganization => ({
	githubId: org.id.toString(),
	login: org.login,
	role,
});

// Both sources are incomplete on their own: the memberships list is the only one with roles and private memberships, but orgs
// restricting our OAuth app are silently missing from it. Those are visible in the public list, without a role, so they become members.
export const getGithubOrganizations = async (user: User): Promise<GithubOrganization[]> => {
	const [ memberships, publicOrgs ] = await Promise.all([
		githubRequest<GithubMembershipsResponse>('/user/memberships/orgs', user.github_oauth_token),
		// Public memberships of any user, so this one also lists the orgs restricting our OAuth app.
		githubRequest<GithubOrgsResponse>(`/user/${user.external_identifier}/orgs`, user.github_oauth_token),
	]).catch((error) => {
		throw githubSyncError(error.response?.status);
	});

	const organizations = memberships.data
		.filter(membership => membership.state === 'active')
		// GitHub also has the `billing_manager` role, which is treated as `member`.
		.map(membership => toOrganization(membership.organization, membership.role === 'admin' ? 'admin' : 'member'));

	const knownIds = new Set(organizations.map(org => org.githubId));

	return [
		...organizations,
		...publicOrgs.data.filter(org => !knownIds.has(org.id.toString())).map(org => toOrganization(org, 'member')),
	];
};

// Asks GitHub about one specific org, to be sure before removing a membership.
// An org can be missing from getGithubOrganizations() even when the user is still in it: that happens when the org restricts
// our OAuth app => missing from /user/memberships/orgs and the user hides the membership => missing from /user/${user.external_identifier}/orgs. Here only a 404 means "not a member"; anything else means "we don't know".
export const isStillGithubOrganizationMember = async (user: User, orgLogin: string): Promise<boolean | null> => {
	return githubRequest(`/user/memberships/orgs/${orgLogin}`, user.github_oauth_token)
		.then(() => true)
		.catch(error => error.response?.status === 404 ? false : null);
};

export const getGithubUsername = async (user: User): Promise<string> => {
	const response = await githubRequest<GithubUserResponse>(`/user/${user.external_identifier}`, user.github_oauth_token)
		.catch((error) => {
			throw githubSyncError(error.response?.status);
		});

	return response.data.login;
};
