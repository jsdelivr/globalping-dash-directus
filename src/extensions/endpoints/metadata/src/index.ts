import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

const getMetadataSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { logger, env } = context;

	router.get('/', async (req, res) => {
		try {
			const { error } = getMetadataSchema.validate(req, { convert: true });

			if (error) {
				throw new (createError('FORBIDDEN', 'Forbidden', 403))();
			}

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
