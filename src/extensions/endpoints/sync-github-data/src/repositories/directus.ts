import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import type { User } from '../actions/sync-github-data.js';
import type { Request } from '../index.js';

export const getDirectusUser = async (userId: string, accountability: Request['accountability'], context: EndpointExtensionContext) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	if (accountability.user !== userId && accountability.admin !== true) {
		throw new (createError('UNAUTHORIZED', 'Unauthorized.', 401))();
	}

	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const user = await itemsService.readOne(userId) as User | undefined;
	return user;
};

export const updateDirectusUser = async (user: User, updateObject: Partial<User>, context: EndpointExtensionContext) => {
	const { services, database, getSchema } = context;
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema({ database }),
		knex: database,
	});
	await usersService.updateOne(user.id, updateObject);
};
