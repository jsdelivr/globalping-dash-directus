import axios from 'axios';
import { User } from '../actions/sync-github-data';
import { EndpointExtensionContext } from '@directus/extensions';

type GithubUserResponse = {
	login: string;
	id: number;
};

type GithubOrgsResponse = {
	login: string;
}[];

export const getGithubUsername = async (user: User, context: EndpointExtensionContext) => {
	const response = await axios.get<GithubUserResponse>(`https://api.github.com/user/${user.external_identifier}`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubUsername = response.data.login;
	return githubUsername;
};

export const getGithubOrgs = async (user: User, context: EndpointExtensionContext) => {
	const orgsResponse = await axios.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubOrgs = orgsResponse.data.map(org => org.login);
	return githubOrgs;
};
