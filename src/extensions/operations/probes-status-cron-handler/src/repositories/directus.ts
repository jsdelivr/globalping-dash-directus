import type { OperationContext } from '@directus/extensions';

export type Probe = {
	id: string;
	status: string;
	onlineTimesToday: number;
};

export const getProbes = async ({ services, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	const result = await itemsService.readByQuery({}) as Probe[];
	return result;
};

export const increaseOnlineTimes = async (probes: Probe[], { services, getSchema }: OperationContext) => {
	if (probes.length === 0) {
		return [];
	}

	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	const updatedIds = await itemsService.updateBatch(probes.map(({ id, onlineTimesToday }) => ({
		id,
		onlineTimesToday: onlineTimesToday + 1,
	})), { emitEvents: false }) as number[];

	return updatedIds;
};
