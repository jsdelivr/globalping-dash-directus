import type { OperationContext } from '@directus/extensions';

export type AdoptedProbe = {
	id: number;
	ip: string;
	onlineTimesToday: number;
}

export const getAdoptedProbes = async ({ services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await itemsService.readByQuery({}) as AdoptedProbe[];
	return result;
};

export const increaseOnlineTimes = async (adoptedProbes: AdoptedProbe[], { services, database, getSchema }: OperationContext) => {
	if (adoptedProbes.length === 0) {
		return [];
	}

	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const updatedIds = await itemsService.updateBatch(adoptedProbes.map(({ id, onlineTimesToday }) => ({
		id,
		onlineTimesToday: onlineTimesToday + 1,
	})), { emitEvents: false }) as number[];

	return updatedIds;
};
