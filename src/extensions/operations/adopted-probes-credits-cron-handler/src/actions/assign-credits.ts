import type { OperationContext } from '@directus/extensions';
import { getAdoptedProbes, addCredits, resetOnlineTimes } from '../repositories/directus.js';

export const assignCredits = async (context: OperationContext) => {
	const requiredOnlineTimes = context.env.ADOPTED_PROBES_REQUIRED_ONLINE_TIMES;

	if (!requiredOnlineTimes) {
		throw new Error('ADOPTED_PROBES_REQUIRED_ONLINE_TIMES was not provided');
	}

	const adoptedProbes = await getAdoptedProbes(context);

	const onlineAdoptedProbes = adoptedProbes.filter(({ onlineTimesToday }) => onlineTimesToday >= requiredOnlineTimes);

	const creditIds = await addCredits(onlineAdoptedProbes, context);
	await resetOnlineTimes(context);

	return creditIds;
};
