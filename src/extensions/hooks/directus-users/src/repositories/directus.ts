import type { HookExtensionContext } from '@directus/extensions';
import { Accountability } from '@directus/types';

type DirectusUser = {
	id: string;
	external_identifier: string;
};

export const getDirectusUsers = async (userIds: string[], accountability: Accountability | null, { services, database, getSchema }: HookExtensionContext): Promise<DirectusUser[]> => {
	const { ItemsService } = services;

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		accountability,
		knex: database,
	});

	const users = await usersService.readByQuery({
		filter: {
			id: { _in: userIds },
		},
	}) as DirectusUser[];
	return users;
};

export const deleteCreditsAdditions = async (users: DirectusUser[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const githubIds = users.map(user => user.external_identifier);
	const result = await creditsAdditionsService.deleteByQuery({ filter: { github_id: { _in: githubIds } } }) as string[];
	return result;
};
