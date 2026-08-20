import { isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { ALL_ACCOUNTS, getRequestAccountId } from '../../../lib/src/accounts.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
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
	account_id: string;
};

const getApplicationsSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	query: Joi.object({
		// PHASE4: remove `userId`, `accountId` is the only owner input.
		userId: Joi.string(),
		accountId: Joi.string(),
		offset: Joi.number().optional().default(0),
		limit: Joi.number().optional().max(100).default(10),
	}).xor('userId', 'accountId').required(),
}).custom(allowOnlyForCurrentUserAndAdmin('query')).unknown(true);

const revokeApplicationSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	body: Joi.object({
		// PHASE4: remove `userId`, `accountId` is the only owner input.
		userId: Joi.string(),
		accountId: Joi.string(),
		id: Joi.string().required(),
	}).xor('userId', 'accountId').required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context) => {
	const { database, logger } = context;

	router.get('/', validate(getApplicationsSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const query = req.query as unknown as { userId?: string; accountId?: string; offset: number; limit: number };
		const accountId = await getRequestAccountId(query, req.accountability, context, [ 'admin', 'member' ]);

		const rankedTokensQuery = database('gp_tokens')
			.select(
				'id',
				'app_id',
				'date_last_used',
				'user_created',
				'account_id',
				database.raw('ROW_NUMBER() OVER (PARTITION BY app_id, account_id, user_created ORDER BY date_last_used DESC) AS row_num'),
			)
			.whereNotNull('app_id')
			.modify(q => accountId === ALL_ACCOUNTS ? q : q.where({ account_id: accountId, user_created: req.accountability.user }))
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
					'rankedTokens.account_id',
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
				// PHASE4: remove `user_id`, the account identifies the owner.
				user_id: token.user_created,
				account_id: token.account_id,
			};

			if (!app.owner_url && app.owner_name === 'Globalping') {
				app.owner_url = 'https://globalping.io/';
			}

			return app;
		});

		res.send({ applications, total });
	}, context));

	router.post('/revoke', validate(revokeApplicationSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;

		try {
			const body = req.body as { userId?: string; accountId?: string; id: string };
			const accountId = await getRequestAccountId(body, req.accountability, context, [ 'admin', 'member' ]);
			// Each user manages only their own tokens and approvals, either in their own account or inside the org.
			const owner = { account_id: accountId, user_created: req.accountability.user };

			await Promise.all([
				database('gp_tokens')
					.where({ ...owner, app_id: body.id }).del(),
				database('gp_apps_approvals')
					.where({ ...owner, app: body.id }).del(),
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
	}, context));
});
