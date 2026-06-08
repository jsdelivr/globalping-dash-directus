import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { defineEndpoint } from '@directus/extensions-sdk';
import axios from 'axios';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { getLinkGenerator } from '../../../lib/src/link-generator.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { syncGithubData } from './actions/sync-github-data.js';

export type Request = ExpressRequest & {
	accountability: {
		user: string;
		admin: boolean;
	};
	schema: object;
};

const TooManyRequestsError = createError('TOO_MANY_REQUESTS', 'Too many requests', 429);
const InvalidPayloadError = createError('INVALID_PAYLOAD_ERROR', 'Invalid confirmation link.', 400);

export const rateLimiter = new RateLimiterMemory({
	points: 10,
	duration: 60 * 60,
});

const syncGithubDataSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	body: Joi.object({
		userId: Joi.string().required(),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context: EndpointExtensionContext) => {
	router.post('/', validate(syncGithubDataSchema), asyncWrapper(async (_req, res) => {
		try {
			const req = _req as Request;
			const requesterId = req.accountability.user;
			const userId = req.body.userId;

			await rateLimiter.consume(requesterId, 1).catch(() => { throw new TooManyRequestsError(); });

			const result = await syncGithubData(userId, context);

			res.send(result);
		} catch (error: unknown) {
			if (axios.isAxiosError(error)) {
				res.status(400).send(error.message);
			} else {
				throw error;
			}
		}
	}, context));

	router.post('/default-tag/confirm', asyncWrapper(async (req, res) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const tokenPayload = getLinkGenerator(context).verifyToken(data, 'default-tag-change');

		if (!tokenPayload) {
			throw new InvalidPayloadError();
		}

		const { UsersService } = context.services;
		const usersService = new UsersService({ schema: await context.getSchema() });
		await usersService.updateOne(tokenPayload.userId, { deprecated_prefix: null });

		res.status(200).send();
	}, context));
});
