import type { ApiExtensionContext } from '@directus/extensions';
import axios from 'axios';
import axiosRetry, { type AxiosRetry } from 'axios-retry';

type User = {
	external_identifier: string | null;
	github_oauth_token: string | null;
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

export class GithubTokenRejectedError extends Error {}

const isTokenError = (error: { response?: { status?: number } }) => error.response?.status === 401 || error.response?.status === 403;

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

// Public memberships of any user, so it also lists the orgs restricting our OAuth app.
const getPublicOrganizations = (user: User, token: string | null) => {
	return githubRequest<GithubOrgsResponse>(`/user/${user.external_identifier}/orgs`, token);
};

export const getGithubApiClient = (userToken: string | null, context: ApiExtensionContext) => {
	if (!userToken) {
		return axios.create({
			timeout: 5000,
			headers: {
				Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
			},
		});
	}

	const client = axios.create({
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${userToken}`,
		},
	});

	(axiosRetry as unknown as AxiosRetry)(client, {
		retries: 1,
		retryCondition: (error) => {
			return error.response?.status === 401 || error.response?.status === 403;
		},
		onRetry: (_retryCount, _error, request) => {
			request.headers!.Authorization = `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`;
		},
	});

	return client;
};

// Both sources are incomplete on their own: the memberships list is the only one with roles and private memberships, but orgs
// restricting our OAuth app are silently missing from it. Those are visible in the public list, without a role, so they become members.
export const getGithubOrganizations = async (user: User, context: ApiExtensionContext): Promise<GithubOrganization[]> => {
	if (!user.github_oauth_token) {
		const publicOrgs = await getPublicOrganizations(user, context.env.GITHUB_ACCESS_TOKEN);
		return publicOrgs.data.map(org => toOrganization(org, 'member'));
	}

	const [ memberships, publicOrgs ] = await Promise.all([
		githubRequest<GithubMembershipsResponse>('/user/memberships/orgs', user.github_oauth_token)
			.catch((error) => {
				throw isTokenError(error) ? new GithubTokenRejectedError() : error;
			}),
		getPublicOrganizations(user, user.github_oauth_token)
			.catch(error => isTokenError(error) ? getPublicOrganizations(user, context.env.GITHUB_ACCESS_TOKEN) : Promise.reject(error))
			.catch(() => ({ data: [] as GithubOrgsResponse })),
	]);

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

// An org missing from getGithubOrganizations() doesn't mean the user left it. It also disappears when:
// - the membership is private and the org restricts our OAuth app, so it is in neither of the two lists;
// - the user has no token, leaving only the public list, where every private membership is missing.
// So a membership is removed only on a 404 here; 403 and the errors (including the missing token) keep it.
export const isStillGithubOrganizationMember = async (user: User, orgLogin: string): Promise<boolean | null> => {
	return githubRequest(`/user/memberships/orgs/${orgLogin}`, user.github_oauth_token)
		.then(() => true)
		.catch(error => error.response?.status === 404 ? false : null);
};
