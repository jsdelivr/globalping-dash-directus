import { OperationContext } from '@directus/types';

type AddItemData = {
	githubLogin: string;
	githubId: number;
	amount: number;
}

type Context = {
	services: OperationContext['services'],
	database: OperationContext['database'],
	getSchema: OperationContext['getSchema'],
};

const CREDITS_PER_DOLLAR = 10_000;

export const addCredits = async ({ githubLogin, githubId, amount }: AddItemData, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsService.createOne({
		githubLogin,
		githubId,
		amount,
		credits: amount * CREDITS_PER_DOLLAR
	});
	return result;
};
