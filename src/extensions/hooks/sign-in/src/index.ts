import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { type AccountRole, getAccountRole } from '../../../lib/src/accounts.js';
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
	account: string[];
};

type AuthPayload = {
	id: string;
	role: string;
	app_access: boolean;
	admin_access: boolean;
	github_username?: string;
	user_type?: string;
	user_account_id?: string;
	active_account_id?: string;
	active_account_role?: AccountRole;
	session?: string;
};

type AuthJwtMeta = { user?: string; provider?: string; type?: 'login' | 'refresh' };

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
		const jwtMeta = meta as AuthJwtMeta;
		const { user: userId, provider } = jwtMeta;
		const { services, getSchema, database } = context;
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

		if (user?.account?.[0]) {
			payload.user_account_id = user.account[0];
		}

		const activeAccount = await getActiveAccount(jwtMeta, payload, database);

		if (activeAccount) {
			payload.active_account_id = activeAccount.id;
			payload.active_account_role = activeAccount.role;
		}

		return payload;
	});
});

const getActiveAccount = async ({ user, type }: AuthJwtMeta, payload: AuthPayload, database: HookExtensionContext['database']) => {
	if (type === 'refresh' && payload.session) {
		// On refresh Directus inserts the new `directus_sessions` row and links the old one to it through `next_token` before
		// `auth.jwt` runs; the old row expires after SESSION_REFRESH_GRACE_PERIOD, so we are copying its `active_account` to the new one.
		const carried = await carryOverActiveAccount(user!, payload.session, database);

		if (carried) { return carried; }
	}

	if (payload.user_account_id) { return { id: payload.user_account_id, role: 'owner' as const }; }

	return null;
};


const carryOverActiveAccount = async (userId: string, sessionToken: string, database: HookExtensionContext['database']) => {
	const [ activeAccountRows ] = await database.raw(`
		SELECT COALESCE(curr.active_account, prev.active_account) AS active_account
		FROM directus_sessions prev LEFT JOIN directus_sessions curr ON curr.token = prev.next_token
		WHERE prev.next_token = :token
	`, { token: sessionToken }) as [{ active_account: string | null }[]];

	const accountId = activeAccountRows[0]?.active_account;

	if (!accountId) { return null; }

	const role = await getAccountRole(accountId, userId, database);

	if (!role) { return null; }

	await database.raw(`
		UPDATE directus_sessions SET active_account = COALESCE(active_account, :account) WHERE token = :token
	`, { account: accountId, token: sessionToken });

	return { id: accountId, role };
};

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
