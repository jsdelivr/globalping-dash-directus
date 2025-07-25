import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { getUserBonus } from '../../../lib/src/add-credits.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';

type User = {
	external_identifier: string | null;
};

type Request = ExpressRequest & {
	accountability: {
		user: string;
		admin: boolean;
	};
	schema: object;
};

const sponsorshipDetailsSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	query: Joi.object({
		userId: Joi.string().required(),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('query')).unknown(true);

export default defineEndpoint((router, context) => {
	const { logger, services, getSchema, database } = context;

	router.get('/', async (req, res) => {
		try {
			const { value, error } = sponsorshipDetailsSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = value.query.userId;
			const { UsersService } = services;

			const usersService = new UsersService({
				schema: await getSchema({ database }),
				knex: database,
			});
			const user = await usersService.readOne(userId) as User;
			const { bonus, dollarsInLastYear } = await getUserBonus(user.external_identifier, 0, context);

			res.send({
				bonus,
				donatedInLastYear: dollarsInLastYear,
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
