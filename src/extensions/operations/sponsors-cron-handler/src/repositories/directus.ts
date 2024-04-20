import { OperationContext } from '@directus/types';
import { DirectusSponsor, GithubSponsor } from '../types.js';

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

		await usersService.updateByQuery({ filter: {
			external_identifier: githubSponsor.githubId,
			user_type: { _neq: 'special' },
		} }, {
			user_type: 'sponsor',
		});

		const result = await sponsorsService.createOne({
			github_login: githubSponsor.githubLogin,
			github_id: githubSponsor.githubId,
			monthly_amount: githubSponsor.monthlyAmount,
			last_earning_date: new Date().toISOString(),
		});

		return result;
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

export const deleteDirectusSponsor = async (directusSponsor: DirectusSponsor, { services, database, getSchema }: Context) => {
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

		await usersService.updateByQuery({ filter: {
			external_identifier: directusSponsor.github_id,
			user_type: { _neq: 'special' },
		} }, {
			user_type: 'member',
		});

		const result = await sponsorsService.deleteOne(directusSponsor.id);
		return result;
	});

	return result;
};

type AddCreditsData = {
	github_id: string;
	amount: number;
}

export const addCredits = async ({ github_id, amount }: AddCreditsData, { services, database, getSchema, env }: Context) => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await creditsAdditionsService.createOne({
		github_id,
		amount: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment: `For $${amount} recurring sponsorship`,
	});
	return result;
};
