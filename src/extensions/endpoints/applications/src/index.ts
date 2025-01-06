import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import _ from 'lodash';

type Request = ExpressRequest & {
	accountability: EventContext['accountability'];
};

type AppToken = {
	id: number;
	app_id: number;
	date_last_used: string | null;
	app_name: string;
	owner_name: string;
	owner_url: string;
};

const getApplications = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { database, logger } = context;

	router.get('/', async (req, res) => {
		try {
			const { value, error } = getApplications.validate(req, { convert: true });

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const appTokens = await database('gp_tokens')
				.leftJoin('gp_apps', 'gp_tokens.app_id', 'gp_apps.id')
				.where({ 'gp_tokens.user_created': value.accountability!.user! })
				.whereNot({ 'gp_tokens.app_id': null })
				.select(
					'gp_tokens.id as id',
					'gp_tokens.app_id as app_id',
					'gp_tokens.date_last_used as date_last_used',
					'gp_apps.name as app_name',
					'gp_apps.owner_name as owner_name',
					'gp_apps.owner_url as owner_url',
				)
				.orderBy('gp_tokens.date_last_used', 'desc')
				.limit(100) as AppToken[];

			const applications = _.uniqBy(appTokens, 'app_id').map(token => ({
				id: token.app_id,
				name: token.app_name,
				date_last_used: token.date_last_used,
				owner_name: token.owner_name,
				owner_url: token.owner_url,
			}));

			res.send({ applications });
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
