import type { OperationContext } from '@directus/extensions';
import { grantProbeCredits } from '../repositories/directus.js';

export const assignCredits = async (context: OperationContext) => {
	const requiredOnlineTimes = context.env.ADOPTED_PROBES_REQUIRED_ONLINE_TIMES;

	if (!requiredOnlineTimes) {
		throw new Error('ADOPTED_PROBES_REQUIRED_ONLINE_TIMES was not provided');
	}

	if (!context.env.CREDITS_PER_ADOPTED_PROBE_DAY || !String(context.env.CREDITS_PER_ADOPTED_PROBE_DAY).trim()) {
		throw new Error('CREDITS_PER_ADOPTED_PROBE_DAY was not provided');
	}

	const amount = Number(context.env.CREDITS_PER_ADOPTED_PROBE_DAY);
	const required = Number(requiredOnlineTimes);

	if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(required) || required < 1) {
		throw new Error('Probe credit amount and required online times must be valid integers');
	}

	return grantProbeCredits(context, amount, required);
};
