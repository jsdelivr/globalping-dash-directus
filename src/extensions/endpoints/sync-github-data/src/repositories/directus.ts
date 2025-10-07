import type { EndpointExtensionContext } from '@directus/extensions';
import type { User } from '../actions/sync-github-data.js';

export const getDirectusUser = async (userId: string, context: EndpointExtensionContext) => {
	const { services, getSchema } = context;
	const { ItemsService } = services;

	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema(),
	});

	const user = await itemsService.readOne(userId) as User | undefined;
	return user;
};

export const updateDirectusUser = async (user: User, updateObject: Partial<User>, context: EndpointExtensionContext) => {
	const { services, getSchema } = context;
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema(),
	});
	await usersService.updateOne(user.id, updateObject);
};
