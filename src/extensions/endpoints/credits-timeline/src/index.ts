import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';

type Request = ExpressRequest & {
	accountability: EventContext['accountability'];
};

type CreditsChange = {
	id: string;
	type: 'addition' | 'deduction';
	date_created: string;
	amount: number;
	reason: string;
	meta: string;
};

const creditsTimelineSchema = Joi.object<Request>({
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

export default defineEndpoint((router, context) => {
	const { database, logger } = context;

	router.get('/', async (req, res) => {
		try {
			const { value, error } = creditsTimelineSchema.validate(req, { convert: true });

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const query = value.query as unknown as { userId: string; offset: number; limit: number };

			const changesSql = database.unionAll([
				database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.modify(q => query.userId === 'all' ? q : q.where('directus_users.id', query.userId))
					.select(
						'gp_credits_additions.id',
						database.raw('"addition" as type'),
						'gp_credits_additions.date_created',
						database.raw('SUM(gp_credits_additions.amount) as amount'),
						'gp_credits_additions.reason',
						database.raw('NULL as meta'),
					)
					.where('gp_credits_additions.reason', 'adopted_probe')
					.groupByRaw('DATE(gp_credits_additions.date_created)'),

				database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.modify(q => query.userId === 'all' ? q : q.where('directus_users.id', query.userId))
					.select(
						'gp_credits_additions.id',
						database.raw('"addition" as type'),
						'gp_credits_additions.date_created',
						'gp_credits_additions.amount',
						'gp_credits_additions.reason',
						'gp_credits_additions.meta',
					)
					.whereNot('gp_credits_additions.reason', 'adopted_probe'),

				database('gp_credits_deductions')
					.modify(q => query.userId === 'all' ? q : q.where('user_id', query.userId))
					.select(
						'id',
						database.raw('"deduction" as type'),
						database.raw('DATE_FORMAT(date, "%Y-%m-%d") as date_created'),
						'amount',
						database.raw('NULL as reason'),
						database.raw('NULL as meta'),
					),
			]);

			const countSql = database.from(changesSql.clone().as('changes')).select(database.raw('count(*) over () as count')).first() as Promise<{ count: number } | undefined>;
			const changesPageSql = changesSql
				.select('*')
				.orderBy([{ column: 'date_created', order: 'desc' }, { column: 'type', order: 'desc' }])
				.limit(query.limit).offset(query.offset) as Promise<CreditsChange[]>;

			const [ { count } = { count: 0 }, changes ] = await Promise.all([ countSql, changesPageSql ]);

			changes.forEach((change) => { change.meta = JSON.parse(change.meta); });
			res.send({ changes, count });
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
