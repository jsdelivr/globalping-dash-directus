import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { checkDefaultPrefix } from '../../../lib/src/deprecate-prefix.js';
import { getGithubOrganizations, type GithubOrganization } from '../../../lib/src/github-api-client.js';
import { syncOrganizations } from '../../../lib/src/sync-orgs.js';

type User = {
	id: string;
	external_identifier: string | null;
	github_username: string | null;
	github_organizations: string[];
	github_oauth_token: string | null;
	user_type: string;
	default_prefix: string | null;
	deprecated_prefix: string | null;
	public_probes: boolean;
};

type AuthPayload = {
	id: string;
	role: string;
	app_access: boolean;
	admin_access: boolean;
	github_username?: string;
	user_type?: string;
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

export default defineHook(({ filter }, context) => {
	filter('auth.create', (payload: { auth_data: undefined; [key: string]: unknown }, meta: Record<string, unknown>) => {
		const githubMeta = meta as GithubAuthMeta;

		payload.github_oauth_token = githubMeta.providerPayload.accessToken;
		payload.github_username = githubMeta.providerPayload.userInfo.login;
		return payload;
	});

	filter('auth.update', (payload: { auth_data: undefined; [key: string]: unknown }, meta: Record<string, unknown>) => {
		const githubMeta = meta as GithubAuthMeta;

		payload.github_oauth_token = githubMeta.providerPayload.accessToken;
		payload.github_username = githubMeta.providerPayload.userInfo.login;
		return payload;
	});

	filter('auth.jwt', async (payload: AuthPayload, meta) => {
		const { user: userId, provider } = meta as { user?: string; provider?: string };
		const { services, getSchema } = context;
		const { ItemsService } = services;

		if (!userId) {
			return payload;
		}

		// This can't be done in action('auth.login') because it is never emitted if user opens dashboard every day and never logs out.
		if (provider === 'github') {
			syncGithubData(userId, context).catch(error => context.logger.error(error));
		}

		const itemsService = new ItemsService('directus_users', {
			schema: await getSchema(),
		});

		const user = await itemsService.readOne(userId) as User | undefined;

		if (user?.user_type) {
			payload.user_type = user.user_type;
		}

		if (user?.github_username) {
			payload.github_username = user.github_username;
		}

		return payload;
	});
});

const syncGithubData = async (userId: string, context: HookExtensionContext) => {
	const { services, getSchema } = context;
	const { ItemsService } = services;

	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema(),
	});

	const user = await itemsService.readOne(userId, {}, {
		// `emitEvents: false` keeps `github_oauth_token` from being masked by the directus-users users.read hook.
		emitEvents: false,
	}) as User | undefined;

	if (!user || !user.external_identifier) {
		throw new Error('Not enough data to sync with GitHub');
	}

	const organizations = await getGithubOrganizations(user, context);
	await syncOrganizations(user, organizations, context);
	await syncGithubOrganizationsList(user, organizations, context);
	await checkDefaultPrefix(user, context);
};

// PHASE5: remove. The old flat list of org names, used for the tag prefixes until they move to the account.
const syncGithubOrganizationsList = async (user: User, organizations: GithubOrganization[], context: HookExtensionContext) => {
	const githubOrgs = organizations.map(org => org.login);

	if (!_.isEqual(user.github_organizations.sort(), githubOrgs.sort())) {
		await updateUser(user, { github_organizations: githubOrgs }, context);
		user.github_organizations = githubOrgs;
	}
};

const updateUser = async (user: User, updateObject: Partial<User>, context: HookExtensionContext) => {
	const { services, getSchema } = context;
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema(),
	});
	await usersService.updateOne(user.id, updateObject);
};
