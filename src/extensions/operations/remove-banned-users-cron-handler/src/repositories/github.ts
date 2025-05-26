import type { OperationContext } from '@directus/extensions';
import { isAxiosError } from 'axios';
import { getGithubApiClient } from '../../../../lib/src/github-api-client.js';
import type { DirectusUser, GithubUser } from '../types.js';

export const getGithubUser = async (user: DirectusUser, context: OperationContext) => {
	try {
		const client = getGithubApiClient(user.github_oauth_token, context);
		const response = await client.get<GithubUser>(`https://api.github.com/user/${user.external_identifier}`);
		return response.data;
	} catch (error) {
		if (isAxiosError(error) && error.response && error.response.status === 404) {
			return null;
		}

		throw error;
	}
};

