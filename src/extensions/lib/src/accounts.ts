import { createError } from '@directus/errors';
import type { ApiExtensionContext } from '@directus/extensions';

type AccountInput = { accountId?: string; userId?: string };

type Accountability = { user?: string | null; admin?: boolean };

const ForbiddenAccountError = createError('INVALID_PAYLOAD_ERROR', 'You can not access this account.', 400);
const AccountNotFoundError = createError('INVALID_PAYLOAD_ERROR', 'Account not found.', 400);

// The admin-only "show everything" mode of the dashboard lists.
export const ALL_ACCOUNTS = 'all';

const getUserAccountId = async (userId: string, { database }: ApiExtensionContext) => {
	const account = await database('gp_accounts').where({ user: userId }).first<{ id: string } | undefined>('id');

	if (!account) {
		throw new AccountNotFoundError();
	}

	return account.id;
};

// The account is available to its own user, and to the members of its org whose role is one of `roles`.
export const isAccountAvailable = async (accountId: string, userId: string, database: ApiExtensionContext['database'], roles: string[]): Promise<boolean> => {
	const [ rows ] = await database.raw(`
		SELECT a.id FROM gp_accounts a
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.user = :user AND m.role IN (:roles)
		WHERE a.id = :account AND (a.user = :user OR m.id IS NOT NULL)
	`, { user: userId, account: accountId, roles }) as [{ id: string }[]];

	return rows.length > 0;
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

// The account a request acts on, checked against the requester: their own account, or an org account where they have one of
// `roles`. `ALL_ACCOUNTS` is allowed for Directus admins only.
// PHASE5: with `accountId` the only input there is nothing to resolve - rename to `validateAccountId` and return nothing.
export const getRequestAccountId = async (
	input: AccountInput,
	accountability: Accountability,
	context: ApiExtensionContext,
	roles: string[] = [ 'admin' ],
): Promise<string> => {
	// PHASE5: remove the `userId` branch, `accountId` is the only input.
	const accountId = input.accountId ?? await getUserAccountId(input.userId ?? accountability.user!, context);

	if (accountability.admin) {
		return accountId;
	}

	if (accountId === ALL_ACCOUNTS) {
		throw new ForbiddenAccountError();
	}

	if (!await isAccountAvailable(accountId, accountability.user!, context.database, roles)) {
		throw new ForbiddenAccountError();
	}

	return accountId;
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

// A probe's owner columns for an account: the account itself, plus the user when the account is personal.
// PHASE5: remove - `userId` is dropped and the account alone defines the owner.
export const getAccountOwnerFields = async (accountId: string, { database }: ApiExtensionContext) => {
	const account = await database('gp_accounts').where({ id: accountId }).first<{ user: string | null }>('user');

	return { account_id: accountId, userId: account?.user ?? null };
};
