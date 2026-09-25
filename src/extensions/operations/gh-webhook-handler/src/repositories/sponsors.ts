/* eslint-disable camelcase */
import type { OperationContext } from '@directus/extensions';
import { setSponsorshipTier } from '../../../../lib/src/sponsorship-tier.js';

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

export const addSponsor = async ({ github_login, github_id, monthly_amount, last_earning_date }: AddItemData, context: Context) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	const result = await database.transaction(async (trx) => {
		const sponsorsService = new ItemsService('sponsors', {
			schema: await getSchema(),
			knex: trx,
		});

		await setSponsorshipTier(github_id, 'sponsor', context, trx);

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

export const updateSponsor = async ({ github_id, monthly_amount }: UpdateItemData, { services, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema(),
	});

	const result = await sponsorsService.updateByQuery({ filter: { github_id: { _eq: github_id } } }, { monthly_amount });
	return result.toString();
};
