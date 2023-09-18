import { OperationContext } from '@directus/types';
import { DirectusSponsor } from '../types';

type Context = {
	services: OperationContext['services'];
	database: OperationContext['database'];
	getSchema: OperationContext['getSchema'];
	env: OperationContext['env'];
};

export const getDirectusSponsors = async ({ services, database, getSchema }: Context): Promise<DirectusSponsor[]> => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.readByQuery({}) as DirectusSponsor[];
	return result;
};

export const updateDirectusSponsor = async ({ githubId, monthlyAmount }: Partial<DirectusSponsor>, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.updateByQuery({ filter: { githubId } }, { monthlyAmount });
	return result;
}

export const deleteDirectusSponsor = async ({ id }: { id: DirectusSponsor['id'] }, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.deleteOne(id);
	return result;
}

type AddCreditsData = {
	githubLogin: string;
	githubId: string;
	amount: number;
}
export const addCredits = async ({ githubLogin, githubId, amount }: AddCreditsData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsService.createOne({
		githubLogin,
		githubId,
		amount,
		credits: amount * parseInt(env.CREDITS_PER_DOLLAR, 10)
	});
	return result;
};
