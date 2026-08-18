import type { ApiExtensionContext } from '@directus/extensions';

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
