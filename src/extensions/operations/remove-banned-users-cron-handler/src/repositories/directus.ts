import type { OperationContext } from '@directus/extensions';
import type { Knex } from 'knex';
import type { DirectusUser } from '../types.js';

export const getDirectusUsers = async ({ services, getSchema }: OperationContext): Promise<DirectusUser[]> => {
	const { ItemsService } = services;

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema(),
	});

	const result = await usersService.readByQuery({
		fields: [ 'id', 'external_identifier', 'github_oauth_token', 'status', 'date_updated' ],
	}) as DirectusUser[];
	return result;
};

export const suspendUser = async (user: DirectusUser, context: OperationContext) => {
	const { services, getSchema, database } = context;
	const { UsersService } = services;
	const schema = await getSchema();

	await database.transaction(async (trx) => {
		const usersService = new UsersService({ schema, knex: trx });

		await usersService.updateOne(user.id, { status: 'suspended' });
		await deleteUserTokens(user, trx, context);
	});
};

const deleteUserTokens = async (user: DirectusUser, trx: Knex.Transaction, { services, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const tokensService = new ItemsService('gp_tokens', {
		schema: await getSchema(),
		knex: trx,
	});

	await tokensService.deleteByQuery({ filter: { user_created: { _eq: user.id } } });
};

export const activateUser = async (user: DirectusUser, { services, getSchema }: OperationContext) => {
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema(),
	});

	await usersService.updateOne(user.id, { status: 'active' });
};

export const deleteUser = async (user: DirectusUser, { services, getSchema }: OperationContext) => {
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema(),
	});

	const result = await usersService.deleteOne(user.id) as string;
	return result;
};
