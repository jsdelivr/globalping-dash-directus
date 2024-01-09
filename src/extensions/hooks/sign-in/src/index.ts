import axios from 'axios';
import _ from 'lodash';
import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';

type GithubUserResponse = {
	login: string;
	id: number;
};

type GithubOrgsResponse = {
	login: string;
}[];

type User = {
	id: string;
	external_identifier: string | null;
	github_username: string | null;
	github_organizations: string[];
}

export default defineHook(({ action }, context) => {
	action('auth.login', async (payload) => {
		const userId = payload.user;
		const provider = payload.provider;
		await syncGithubData(userId, provider, context);
	});
});

const syncGithubData = async (userId: string, provider: string, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	if (provider !== 'github') {
		return;
	}

	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const user = await itemsService.readOne(userId) as User | undefined;

	if (!user || !user.external_identifier) {
		throw new Error('Not enough data to sync with GitHub');
	}

	await Promise.all([
		syncGitHubUsername(user, context),
		syncGitHubOrganizations(user, context),
	]);
};

const syncGitHubUsername = async (user: User, context: HookExtensionContext) => {
	const githubResponse = await axios.get<GithubUserResponse>(`https://api.github.com/user/${user.external_identifier}`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubUsername = githubResponse.data.login;

	if (user.github_username !== githubUsername) {
		await updateUser(user, { github_username: githubUsername }, context);
	}
};

const syncGitHubOrganizations = async (user: User, context: HookExtensionContext) => {
	const orgsResponse = await axios.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubOrgs = orgsResponse.data.map(org => org.login);

	if (!_.isEqual(user.github_organizations.sort(), githubOrgs.sort())) {
		await updateUser(user, { github_organizations: githubOrgs }, context);
	}
};

const updateUser = async (user: User, updateObject: Partial<User>, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema({ database }),
		knex: database,
	});
	await usersService.updateOne(user.id, updateObject);
};
