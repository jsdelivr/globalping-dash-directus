import type { OperationContext } from '@directus/extensions';
import type { CreditsAddition, DirectusSponsor, GithubSponsor } from '../types.js';

export const getDirectusSponsors = async ({ services, getSchema }: OperationContext): Promise<DirectusSponsor[]> => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema(),
	});

	const result = await sponsorsService.readByQuery({}) as DirectusSponsor[];
	return result;
};

export const createDirectusSponsor = async (githubSponsor: GithubSponsor, lastEarningDate: Date, { services, database, getSchema }: OperationContext) => {
	const { ItemsService, UsersService } = services;

	const result = await database.transaction(async (trx) => {
		const sponsorsService = new ItemsService('sponsors', {
			schema: await getSchema(),
			knex: trx,
		});

		const usersService = new UsersService({
			schema: await getSchema(),
			knex: trx,
		});

		await usersService.updateByQuery({
			filter: {
				external_identifier: { _eq: githubSponsor.githubId },
				user_type: { _neq: 'special' },
			},
		}, {
			user_type: 'sponsor',
		});

		const result = await sponsorsService.createOne({
			github_login: githubSponsor.githubLogin,
			github_id: githubSponsor.githubId,
			monthly_amount: githubSponsor.monthlyAmount,
			last_earning_date: lastEarningDate.toISOString(),
		});

		return result;
	});

	return result;
};

export const updateDirectusSponsor = async (id: number, data: Partial<DirectusSponsor>, { services, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema(),
	});

	const result = await sponsorsService.updateOne(id, data);
	return result;
};

export const deleteDirectusSponsor = async (directusSponsor: DirectusSponsor, { services, database, getSchema }: OperationContext) => {
	const { ItemsService, UsersService } = services;

	const result = await database.transaction(async (trx) => {
		const sponsorsService = new ItemsService('sponsors', {
			schema: await getSchema(),
			knex: trx,
		});

		const usersService = new UsersService({
			schema: await getSchema(),
			knex: trx,
		});

		await usersService.updateByQuery({
			filter: {
				external_identifier: { _eq: directusSponsor.github_id },
				user_type: { _neq: 'special' },
			},
		}, {
			user_type: 'member',
		});

		const result = await sponsorsService.deleteOne(directusSponsor.id);
		return result;
	});

	return result;
};

export const getRecentCreditsAdditions = async (since: Date, { services, getSchema }: OperationContext): Promise<CreditsAddition[]> => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema(),
	});

	return creditsAdditionsService.readByQuery({
		filter: {
			date_created: { _gte: since.toISOString() },
			reason: { _in: [ 'one_time_sponsorship', 'recurring_sponsorship', 'tier_changed' ] },
		},
		fields: [ 'github_id', 'reason', 'meta', 'date_created' ],
	}) as Promise<CreditsAddition[]>;
};

export const sponsorExists = async (githubId: string, { services, getSchema }: OperationContext): Promise<boolean> => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema(),
	});

	const result = await sponsorsService.readByQuery({
		filter: { github_id: { _eq: githubId } },
		fields: [ 'id' ],
		limit: 1,
	});

	return result.length > 0;
};
