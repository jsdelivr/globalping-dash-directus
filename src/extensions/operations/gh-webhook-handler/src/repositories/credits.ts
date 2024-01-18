import { OperationContext } from '@directus/types';

type AddItemData = {
	githubId: string;
	amount: number;
}

type Context = {
	services: OperationContext['services'];
	database: OperationContext['database'];
	getSchema: OperationContext['getSchema'];
	env: OperationContext['env'];
};

export const addCredits = async ({ githubId, amount }: AddItemData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsService.createOne({
		githubId,
		credits: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment: `For ${amount}$ sponsorship`,
	});
	return result;
};
