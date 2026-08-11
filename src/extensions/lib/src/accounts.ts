import type { ApiExtensionContext } from '@directus/extensions';

export const getUserAccountId = async (userId: string, { database }: ApiExtensionContext) => {
	const account = await database('gp_accounts').where({ user: userId }).first<{ id: string }>('id');
	return account!.id;
};
