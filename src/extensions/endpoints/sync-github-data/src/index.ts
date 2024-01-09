import Joi from 'joi';
import { defineEndpoint } from '@directus/extensions-sdk';
import { createError, isDirectusError } from '@directus/errors';
import axios from 'axios';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Request as ExpressRequest } from 'express';
import type { EndpointExtensionContext } from '@directus/extensions';
import { syncGithubData } from './actions/sync-github-data.js';

export type Request = ExpressRequest & {
	accountability: {
		user: string;
	},
	schema: object,
};

const TooManyRequestsError = createError('TOO_MANY_REQUESTS', 'Too many requests', 429);

const rateLimiter = new RateLimiterMemory({
	points: 10,
	duration: 60 * 60,
});

const syncGithubDataSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		userId: Joi.string().required(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context: EndpointExtensionContext) => {
	router.post('/', async (req, res) => {
		const { logger } = context;

		try {
			const { value, error } = syncGithubDataSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const requesterId = value.accountability.user;
			const userId = value.body.userId;

			await rateLimiter.consume(requesterId, 1).catch(() => { throw new TooManyRequestsError(); });

			const result = await syncGithubData(userId, value.accountability, context);

			res.send(result);
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else if (axios.isAxiosError(error)) {
				res.status(400).send(error.response?.data?.error?.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});
});
