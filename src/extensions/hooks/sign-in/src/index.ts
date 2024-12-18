import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';
import axios from 'axios';
import _ from 'lodash';

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

type AuthPayload = {
	id: string;
	role: string;
	app_access: boolean;
	admin_access: boolean;
	github_username?: string;
	session: string;
};

export default defineHook(({ action, filter }, context) => {
	action('auth.login', async (payload) => {
		const userId = payload.user;
		const provider = payload.provider;
		await syncGithubData(userId, provider, context);
	});

	filter('auth.jwt', async (payload: AuthPayload, meta) => {
		const userId = meta.user;
		const { services, database, getSchema } = context;
		const { ItemsService } = services;

		const itemsService = new ItemsService('directus_users', {
			schema: await getSchema({ database }),
			knex: database,
		});

		const user = await itemsService.readOne(userId) as User | undefined;

		if (!user || !user.github_username) {
			return payload;
		}

		payload.github_username = user.github_username;
		return payload;
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
