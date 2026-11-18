import type { OperationContext } from '@directus/extensions';

export const increaseOnlineTimes = async ({ database }: OperationContext) => {
	return database('gp_probes').where({ status: 'ready' }).increment('onlineTimesToday', 1);
};
