import type { OperationContext } from '@directus/extensions';
import { DirectusUser } from '../types.js';

export const getDirectusUsers = async ({ services, database, getSchema }: OperationContext): Promise<DirectusUser[]> => {
	const { ItemsService } = services;

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await usersService.readByQuery({}) as DirectusUser[];
	return result;
};

export const deleteUser = async (user: DirectusUser, { services, database, getSchema }: OperationContext) => {
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await usersService.deleteOne(user.id) as string;
	return result;
};

export const deleteCreditsAdditions = async (user: DirectusUser, { services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsAdditionsService.deleteByQuery({ filter: { github_id: user.external_identifier } }) as string[];
	return result;
};
