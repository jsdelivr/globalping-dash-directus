import type { HookExtensionContext } from '@directus/extensions';
import type { Accountability } from '@directus/types';

export type DirectusUser = {
	id: string;
	external_identifier: string;
	github_username: string;
	github_organizations: string[];
	default_prefix: string | null;
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

export const deleteCreditsAdditions = async (githubIds: string[], { services, database, getSchema }: HookExtensionContext) => {
	if (githubIds.length === 0) {
		return;
	}

	const { ItemsService } = services;
	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	await creditsAdditionsService.deleteByQuery({ filter: { github_id: { _in: githubIds } } });
};
