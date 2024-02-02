import { OperationContext } from '@directus/types';
import { DirectusSponsor, GithubSponsor } from '../types';

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

export const createDirectusSponsor = async (githubSponsor: GithubSponsor, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.createOne({
		githubLogin: githubSponsor.githubLogin,
		githubId: githubSponsor.githubId,
		monthlyAmount: githubSponsor.monthlyAmount,
		lastEarningDate: new Date().toISOString(),
	});
	return result;
};

export const updateDirectusSponsor = async (id: number, data: Partial<DirectusSponsor>, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.updateOne(id, data);
	return result;
};

export const deleteDirectusSponsor = async ({ id }: { id: DirectusSponsor['id'] }, { services, database, getSchema }: Context) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.deleteOne(id);
	return result;
};

type AddCreditsData = {
	githubId: string;
	amount: number;
}

export const addCredits = async ({ githubId, amount }: AddCreditsData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('gp_credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsService.createOne({
		githubId,
		credits: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment: `For $${amount} recurring sponsorship`,
	});
	return result;
};