import { isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';

export default defineEndpoint((router, context) => {
	const { logger, env } = context;

	router.get('/', async (_req, res) => {
		try {
			res.send({
				targetNodeVersion: env.TARGET_NODE_VERSION,
				targetHardwareDeviceFirmware: env.TARGET_HW_DEVICE_FIRMWARE,
				creditsPerDollar: env.CREDITS_PER_DOLLAR,
				creditsPerAdoptedProbe: env.CREDITS_PER_ADOPTED_PROBE_DAY,
			});
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});
});
