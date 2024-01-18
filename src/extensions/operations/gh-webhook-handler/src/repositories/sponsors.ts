import { OperationContext } from '@directus/types';

type AddItemData = {
	githubLogin: string;
	githubId: string;
	monthlyAmount: number;
	lastEarningDate: string;
}

type Context = {
	services: OperationContext['services'],
	database: OperationContext['database'],
	getSchema: OperationContext['getSchema'],
};

export const addSponsor = async ({ githubLogin, githubId, monthlyAmount, lastEarningDate }: AddItemData, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.createOne({
		githubLogin,
		githubId,
		monthlyAmount,
		lastEarningDate,
	});
	return result;
};

type UpdateItemData = {
	githubId: string;
	monthlyAmount: number;
}

export const updateSponsor = async ({ githubId, monthlyAmount }: UpdateItemData, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.updateByQuery({ filter: { githubId } }, { monthlyAmount });
	return result;
};
