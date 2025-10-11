import type { ApiExtensionContext } from '@directus/extensions';
import axios from 'axios';
import axiosRetry, { type AxiosRetry } from 'axios-retry';

type User = {
	external_identifier: string | null;
	github_oauth_token: string | null;
};

type GithubOrgsResponse = {
	login: string;
}[];

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

export const getGithubOrganizations = async (user: User, context: ApiExtensionContext): Promise<string[]> => {
	if (!user.github_oauth_token) {
		const response = await organizationsRequestWithDefaultToken(user, context);
		return response.data.map(org => org.login);
	}

	const response = await organizationsRequestWithUserToken(user).catch((error) => {
		if (error.response?.status === 401 || error.response?.status === 403) {
			return organizationsRequestWithDefaultToken(user, context);
		}

		throw error;
	});

	return response.data.map(org => org.login);
};

const organizationsRequestWithUserToken = (user: User) => {
	return axios.get<GithubOrgsResponse>(`https://api.github.com/user/orgs`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${user.github_oauth_token}`,
		},
	});
};

const organizationsRequestWithDefaultToken = (user: User, context: ApiExtensionContext) => {
	return axios.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
};
