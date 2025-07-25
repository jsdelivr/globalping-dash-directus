/* eslint-disable camelcase */
import type { OperationContext } from '@directus/extensions';

type AddItemData = {
	github_login: string;
	github_id: string;
	monthly_amount: number;
	last_earning_date: string;
};

type Context = {
	services: OperationContext['services'];
	database: OperationContext['database'];
	getSchema: OperationContext['getSchema'];
};

export const addSponsor = async ({ github_login, github_id, monthly_amount, last_earning_date }: AddItemData, { services, database, getSchema }: Context) => {
	const { ItemsService, UsersService } = services;

	const result = await database.transaction(async (trx) => {
		const sponsorsService = new ItemsService('sponsors', {
			schema: await getSchema({ database }),
			knex: trx,
		});

		const usersService = new UsersService({
			schema: await getSchema({ database }),
			knex: trx,
		});

		await usersService.updateByQuery({
			filter: {
				external_identifier: github_id,
				user_type: { _neq: 'special' },
			},
		}, {
			user_type: 'sponsor',
		});

		const result = await sponsorsService.createOne({
			github_login,
			github_id,
			monthly_amount,
			last_earning_date,
		});

		return result;
	});

	return result;
};

type UpdateItemData = {
	github_id: string;
	monthly_amount: number;
};

export const updateSponsor = async ({ github_id, monthly_amount }: UpdateItemData, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.updateByQuery({ filter: { github_id } }, { monthly_amount });
	return result;
};
