import { defineEndpoint } from '@directus/extensions-sdk';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';

export default defineEndpoint((router, context) => {
	const { env } = context;

	router.get('/', asyncWrapper(async (_req, res) => {
		res.send({
			targetNodeVersion: env.TARGET_NODE_VERSION,
			targetHardwareDeviceFirmware: env.TARGET_HW_DEVICE_FIRMWARE,
			creditsPerDollar: env.CREDITS_PER_DOLLAR,
			creditsPerAdoptedProbe: env.CREDITS_PER_ADOPTED_PROBE_DAY,
			creditsBonusPer100Dollars: env.CREDITS_BONUS_PER_100_DOLLARS,
			maxCreditsBonus: env.MAX_CREDITS_BONUS,
		});
	}, context));
});
