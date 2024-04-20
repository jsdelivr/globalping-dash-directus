import type { OperationContext } from '@directus/extensions';
import { getAdoptedProbes, increaseOnlineTimes } from '../repositories/directus.js';

export const checkOnlineStatus = async (context: OperationContext) => {
	const adoptedProbes = await getAdoptedProbes(context);
	const onlineAdoptedProbes = adoptedProbes.filter(({ status }) => status === 'ready');

	const updatedIds = await increaseOnlineTimes(onlineAdoptedProbes, context);
	return updatedIds;
};
