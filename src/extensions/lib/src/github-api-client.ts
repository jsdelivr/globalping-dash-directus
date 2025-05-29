import type { ApiExtensionContext } from '@directus/extensions';
import axios from 'axios';
import axiosRetry from 'axios-retry';

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

	axiosRetry(client, {
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
