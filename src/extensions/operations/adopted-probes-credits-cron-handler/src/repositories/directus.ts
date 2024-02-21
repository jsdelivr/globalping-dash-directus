import type { OperationContext } from '@directus/extensions';

type AdoptedProbe = {
	id: number;
	name: string | null;
	ip: string;
	onlineTimesToday: number;
	userId: string;
}

type User = {
	id: string;
	external_identifier: string;
};

export const getAdoptedProbes = async ({ services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await itemsService.readByQuery({}) as AdoptedProbe[];
	return result;
};

export const addCredits = async (adoptedProbes: AdoptedProbe[], { services, database, getSchema, env }: OperationContext) => {
	if (!env.CREDITS_PER_ADOPTED_PROBE_DAY) {
		throw new Error('CREDITS_PER_ADOPTED_PROBE_DAY was not provided');
	}

	if (adoptedProbes.length === 0) {
		return [];
	}

	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const users = await usersService.readMany(adoptedProbes.map(({ userId }) => userId)) as User[];
	const usersMap = new Map(users.map(user => [ user.id, user ]));

	const result = await creditsAdditionsService.createMany(adoptedProbes.map(({ id, userId, ip, name }) => ({
		github_id: usersMap.get(userId)?.external_identifier,
		amount: parseInt(env.CREDITS_PER_ADOPTED_PROBE_DAY, 10),
		adopted_probe: id,
		comment: `For the adopted probe ${name ? name + ' ' : ''}(${ip})`,
	}))) as number[];

	return result;
};

export const resetOnlineTimes = async ({ services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	await itemsService.updateByQuery({}, { onlineTimesToday: 0 }, { emitEvents: false });
};
