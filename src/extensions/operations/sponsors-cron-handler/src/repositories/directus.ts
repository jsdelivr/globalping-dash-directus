import type { OperationContext } from '@directus/extensions';
import type { DirectusSponsor, GithubSponsor } from '../types.js';

export const getDirectusSponsors = async ({ services, database, getSchema }: OperationContext): Promise<DirectusSponsor[]> => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.readByQuery({}) as DirectusSponsor[];
	return result;
};

export const createDirectusSponsor = async (githubSponsor: GithubSponsor, { services, database, getSchema }: OperationContext) => {
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

export const updateDirectusSponsor = async (id: number, data: Partial<DirectusSponsor>, { services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await sponsorsService.updateOne(id, data);
	return result;
};

export const deleteDirectusSponsor = async (directusSponsor: DirectusSponsor, { services, database, getSchema }: OperationContext) => {
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
