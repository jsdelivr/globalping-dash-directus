import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { getGithubApiClient } from '../../../lib/src/github-api-client.js';

type GithubOrgsResponse = {
	login: string;
}[];

type User = {
	id: string;
	external_identifier: string | null;
	github_username: string | null;
	github_organizations: string[];
	github_oauth_token: string | null;
}

type AuthPayload = {
	id: string;
	role: string;
	app_access: boolean;
	admin_access: boolean;
	github_username?: string;
	session: string;
};

type GithubAuthMeta = {
	event: 'auth.create' | 'auth.update';
	identifier: string;
	provider: 'github';
	providerPayload: {
		accessToken: string;
		userInfo: { login: string };
	};
};

export default defineHook(({ action, filter }, context) => {
	filter('auth.create', (payload: { auth_data: undefined, [key: string]: unknown }, meta: Record<string, unknown>) => {
		const githubMeta = meta as GithubAuthMeta;

		payload.github_oauth_token = githubMeta.providerPayload.accessToken;
		payload.github_username = githubMeta.providerPayload.userInfo.login;
		return payload;
	});

	filter('auth.update', (payload: { auth_data: undefined, [key: string]: unknown }, meta: Record<string, unknown>) => {
		const githubMeta = meta as GithubAuthMeta;

		payload.github_oauth_token = githubMeta.providerPayload.accessToken;
		payload.github_username = githubMeta.providerPayload.userInfo.login;
		return payload;
	});

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

	await syncGitHubOrganizations(user, context);
};

const syncGitHubOrganizations = async (user: User, context: HookExtensionContext) => {
	const client = getGithubApiClient(user.github_oauth_token, context);
	const orgsResponse = await client.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`);
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
