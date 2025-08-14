import type { EndpointExtensionContext } from '@directus/extensions';
import { getGithubApiClient } from '../../../../lib/src/github-api-client.js';
import type { User } from '../actions/sync-github-data.js';

type GithubUserResponse = {
	login: string;
	id: number;
};

export const getGithubUsername = async (user: User, context: EndpointExtensionContext) => {
	const client = getGithubApiClient(user.github_oauth_token, context);
	const response = await client.get<GithubUserResponse>(`https://api.github.com/user/${user.external_identifier}`);
	const githubUsername = response.data.login;
	return githubUsername;
};
