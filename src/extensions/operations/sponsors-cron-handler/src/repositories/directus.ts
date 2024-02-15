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
		github_login: githubSponsor.githubLogin,
		github_id: githubSponsor.githubId,
		monthly_amount: githubSponsor.monthlyAmount,
		last_earning_date: new Date().toISOString(),
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
	github_id: string;
	amount: number;
}

export const addCredits = async ({ github_id, amount }: AddCreditsData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsService.createOne({
		github_id,
		amount: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment: `For $${amount} recurring sponsorship`,
	});
	return result;
};
