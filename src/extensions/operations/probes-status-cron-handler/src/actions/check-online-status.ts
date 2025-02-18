import type { OperationContext } from '@directus/extensions';
import { getProbes, increaseOnlineTimes } from '../repositories/directus.js';

export const checkOnlineStatus = async (context: OperationContext) => {
	const probes = await getProbes(context);
	const onlineProbes = probes.filter(({ status }) => status === 'ready');

	const updatedIds = await increaseOnlineTimes(onlineProbes, context);
	return updatedIds;
};
