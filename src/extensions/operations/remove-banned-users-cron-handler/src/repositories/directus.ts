import type { OperationContext } from '@directus/extensions';
import type { DirectusUser } from '../types.js';

export const getDirectusUsers = async ({ services, getSchema }: OperationContext): Promise<DirectusUser[]> => {
	const { ItemsService } = services;

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema(),
	});

	const result = await usersService.readByQuery({}) as DirectusUser[];
	return result;
};

export const deleteUser = async (user: DirectusUser, { services, getSchema }: OperationContext) => {
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema(),
	});

	const result = await usersService.deleteOne(user.id) as string;
	return result;
};
