import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { validateUrl } from './utils.js';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

type AppToken = {
	id: number;
	app_id: number;
	date_last_used: string | null;
	app_name: string;
	owner_name: string;
	owner_url: string;
	user_created: string;
};

const getApplicationsSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	query: Joi.object({
		userId: Joi.string().required(),
		offset: Joi.number().optional().default(0),
		limit: Joi.number().optional().max(100).default(10),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('query')).unknown(true);

const revokeApplicationSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	body: Joi.object({
		userId: Joi.string().required(),
		id: Joi.string().required(),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context) => {
	const { database, logger } = context;

	router.get('/', async (req, res) => {
		try {
			const { value, error } = getApplicationsSchema.validate(req, { convert: true });

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const query = value.query as unknown as {userId: string, offset: number, limit: number};

			const rankedTokensQuery = database('gp_tokens')
				.select(
					'id',
					'app_id',
					'date_last_used',
					'user_created',
					database.raw('ROW_NUMBER() OVER (PARTITION BY app_id, user_created ORDER BY date_last_used DESC) AS row_num'),
				)
				.whereNotNull('app_id')
				.modify(q => query.userId === 'all' ? q : q.where('user_created', query.userId))
				.as('rankedTokens');

			const [ appTokens, [{ total }] ] = await Promise.all([
				database
					.from(rankedTokensQuery)
					.leftJoin('gp_apps', 'rankedTokens.app_id', 'gp_apps.id')
					.select(
						'rankedTokens.id as id',
						'rankedTokens.app_id as app_id',
						'rankedTokens.date_last_used as date_last_used',
						'rankedTokens.user_created',
						'gp_apps.name as app_name',
						'gp_apps.owner_name as owner_name',
						'gp_apps.owner_url as owner_url',
					)
					.where({ row_num: 1 })
					.orderByRaw('date_last_used DESC, id DESC')
					.limit(query.limit)
					.offset(query.offset) as Promise<AppToken[]>,

				database
					.from(rankedTokensQuery)
					.where({ row_num: 1 })
					.count('* as total') as unknown as Promise<[{ total: number }]>,
			]);


			const applications = appTokens.map((token) => {
				const app = {
					id: token.app_id,
					name: token.app_name,
					date_last_used: token.date_last_used,
					owner_name: token.owner_name || 'Globalping',
					owner_url: validateUrl(token.owner_url),
					user_id: token.user_created,
				};

				if (!app.owner_url && app.owner_name === 'Globalping') {
					app.owner_url = 'https://globalping.io/';
				}

				return app;
			});

			res.send({ applications, total });
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});

	router.post('/revoke', async (request, res) => {
		try {
			const { value: req, error } = revokeApplicationSchema.validate(request);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			await Promise.all([
				database('gp_tokens')
					.where({
						app_id: req.body.id,
						user_created: req.body.userId,
					}).del(),
				database('gp_apps_approvals')
					.where({
						app: req.body.id,
						user: req.body.userId,
					}).del(),
			]);

			res.send('Application access revoked.');
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
