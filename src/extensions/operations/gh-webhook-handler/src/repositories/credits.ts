import type { OperationContext } from '@directus/extensions';

type AddItemData = {
	github_id: string;
	amount: number;
}

type Context = {
	services: OperationContext['services'];
	database: OperationContext['database'];
	getSchema: OperationContext['getSchema'];
	env: OperationContext['env'];
};

export const addCredits = async ({ github_id, amount }: AddItemData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsAdditionsService.createOne({
		github_id,
		amount: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment: `One-time $${amount} sponsorship.`,
	});
	return result;
};
