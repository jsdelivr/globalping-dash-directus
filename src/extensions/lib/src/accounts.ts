import { createError } from '@directus/errors';
import type { ApiExtensionContext } from '@directus/extensions';

const ForbiddenAccountError = createError('INVALID_PAYLOAD_ERROR', 'You can not adopt a probe into this account.', 400);

export const getUserAccountId = async (userId: string, { database }: ApiExtensionContext) => {
	const account = await database('gp_accounts').where({ user: userId }).first<{ id: string }>('id');
	return account!.id;
};

// The user ids an account's notifications are delivered to: the user itself, or the admins of the org.
export const getAccountUserIds = async (accountId: string, { database }: ApiExtensionContext): Promise<string[]> => {
	const [ rows ] = await database.raw(`
		SELECT COALESCE(a.user, m.user) AS user
		FROM gp_accounts a
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.role = 'admin'
		WHERE a.id = :account
	`, { account: accountId }) as [{ user: string | null }[]];

	return rows.map(row => row.user).filter((user): user is string => Boolean(user));
};

// A probe's owner columns for an account: the account itself, plus the user when the account is personal.
// PHASE4: remove - `userId` is dropped and the account alone defines the owner.
export const getAccountOwnerFields = async (accountId: string, { database }: ApiExtensionContext) => {
	const account = await database('gp_accounts').where({ id: accountId }).first<{ user: string | null }>('user');

	return { account_id: accountId, userId: account?.user ?? null };
};

// PHASE4: remove - `accountId` is the only owner input by then, there is nothing to resolve.
export const resolveLegacyAccountId = async ({ accountId, userId }: { accountId?: string; userId?: string }, context: ApiExtensionContext): Promise<string | undefined> => {
	return accountId ?? (userId ? getUserAccountId(userId, context) : undefined);
};

// Only allow user's own account or an org account where the user is an admin.
export const validateAccountId = async (accountId: string, accountability: { user?: string | null; admin?: boolean }, context: ApiExtensionContext) => {
	if (accountability.admin) {
		return;
	}

	const [ rows ] = await context.database.raw(`
		SELECT a.id FROM gp_accounts a
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.user = :user AND m.role = 'admin'
		WHERE a.id = :account AND (a.user = :user OR m.id IS NOT NULL)
	`, { user: accountability.user, account: accountId }) as [{ id: string }[]];

	if (rows.length === 0) {
		throw new ForbiddenAccountError();
	}
};
