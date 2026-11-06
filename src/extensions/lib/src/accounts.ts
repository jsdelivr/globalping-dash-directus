import { createError } from '@directus/errors';
import type { ApiExtensionContext } from '@directus/extensions';

type Accountability = { user?: string | null; admin?: boolean };

export type AccountRole = 'owner' | 'admin' | 'member' | 'viewer';

export const ForbiddenAccountError = createError('INVALID_PAYLOAD_ERROR', 'You can not access this account.', 400);
const AccountNotFoundError = createError('INVALID_PAYLOAD_ERROR', 'Account not found.', 400);

// The admin-only "show everything" mode of the dashboard lists.
export const ALL_ACCOUNTS = 'all';

export const getUserAccountId = async (userId: string, database: ApiExtensionContext['database']): Promise<string> => {
	const account = await database('gp_accounts').where({ user: userId }).first<{ id: string } | undefined>('id');

	if (!account) {
		throw new AccountNotFoundError();
	}

	return account.id;
};

export const getAccountAccess = async (accountId: string, userId: string, database: ApiExtensionContext['database']): Promise<{ role: AccountRole; userType: string } | null> => {
	const [ rows ] = await database.raw(`
		SELECT IF(a.user = :user, 'owner', m.role) AS role, COALESCE(o.user_type, u.user_type) AS userType FROM gp_accounts a
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.user = :user
		LEFT JOIN gp_orgs o ON o.id = a.org
		LEFT JOIN directus_users u ON u.id = a.user
		WHERE a.id = :account AND (a.user = :user OR m.id IS NOT NULL)
	`, { user: userId, account: accountId }) as [{ role: AccountRole; userType: string }[]];

	return rows[0] ?? null;
};

export const getAccountRole = async (accountId: string, userId: string, database: ApiExtensionContext['database']): Promise<AccountRole | null> => {
	return (await getAccountAccess(accountId, userId, database))?.role ?? null;
};

// The account is available to its own user, and to the members of its org whose role is one of `roles`.
export const isAccountAvailable = async (accountId: string, userId: string, database: ApiExtensionContext['database'], roles: string[]): Promise<boolean> => {
	const role = await getAccountRole(accountId, userId, database);
	return role !== null && [ 'owner', ...roles ].includes(role);
};

// The orgs, of the ones asked about, where the user is an admin.
export const filterOrgIdsByBeingAdmin = async (orgIds: string[], userId: string, database: ApiExtensionContext['database']): Promise<Set<string>> => {
	if (orgIds.length === 0) {
		return new Set();
	}

	const memberships = await database('gp_org_members')
		.whereIn('org', orgIds)
		.where({ user: userId, role: 'admin' })
		.select('org') as { org: string }[];

	return new Set(memberships.map(membership => membership.org));
};

// The account a request acts on must be the requester's own account, or an org account where they have one of `roles`.
// `ALL_ACCOUNTS` is allowed for Directus admins only.
export const validateAccountId = async (
	accountId: string,
	accountability: Accountability,
	context: ApiExtensionContext,
	roles: string[] = [ 'admin' ],
): Promise<void> => {
	if (accountability.admin) {
		return;
	}

	if (accountId === ALL_ACCOUNTS) {
		throw new ForbiddenAccountError();
	}

	if (!await isAccountAvailable(accountId, accountability.user!, context.database, roles)) {
		throw new ForbiddenAccountError();
	}
};

export const getAccountGithubId = async (accountId: string, { database }: ApiExtensionContext): Promise<string | null> => {
	const [ rows ] = await database.raw(`
		SELECT COALESCE(u.external_identifier, o.github_id) AS github_id
		FROM gp_accounts a
		LEFT JOIN directus_users u ON a.user = u.id
		LEFT JOIN gp_orgs o ON a.org = o.id
		WHERE a.id = :account
	`, { account: accountId }) as [{ github_id: string | null }[]];

	return rows[0]?.github_id ?? null;
};
