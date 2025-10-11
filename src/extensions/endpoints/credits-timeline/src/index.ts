import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { queryParser } from '../../../lib/src/middlewares/query-parser.js';
import { validate } from '../../../lib/src/middlewares/validate.js';


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

const ALLOWED_REASONS = [ 'adopted-probes', 'sponsorship', 'other' ];
const ALLOWED_TYPES = [ 'additions', 'deductions' ];

const creditsTimelineSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	query: Joi.object({
		userId: Joi.string().required(),
		offset: Joi.number().optional().default(0),
		limit: Joi.number().optional().max(100).default(10),
		type: Joi.alternatives().try(
			Joi.array().items(Joi.string().valid(...ALLOWED_TYPES)),
			Joi.string().valid(...ALLOWED_TYPES),
		).optional().default(ALLOWED_TYPES),
		reason: Joi.alternatives().try(
			Joi.array().items(Joi.string().valid(...ALLOWED_REASONS)),
			Joi.string().valid(...ALLOWED_REASONS),
		).optional().default(ALLOWED_REASONS),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('query')).unknown(true);

const getAdditionReasonsFromQuery = (reason: string[]) => {
	const fullReasons: Record<string, string[]> = {
		'sponsorship': [ 'one_time_sponsorship', 'recurring_sponsorship', 'tier_changed' ],
		'adopted-probes': [ ],	// adopted probes are handled separately
	};

	const queryReasons: string[] = [];

	reason.forEach((r) => {
		if (fullReasons[r]) {
			queryReasons.push(...fullReasons[r]);
		} else {
			queryReasons.push(r);
		}
	});

	return queryReasons;
};

export default defineEndpoint((router, context) => {
	const { database } = context;

	router.get('/', queryParser, validate(creditsTimelineSchema), asyncWrapper(async (req, res) => {
		const query = req.query as unknown as { userId: string; offset: number; limit: number; reason: string | string[]; type: string | string[] };
		const sqlQueries = [];

		const queriedTypes = Array.isArray(query.type) ? query.type : [ query.type ];
		const queriedReasons = Array.isArray(query.reason) ? query.reason : [ query.reason ];

		if (queriedTypes.includes('deductions')) {
			sqlQueries.push(database('gp_credits_deductions')
				.modify(q => query.userId === 'all' ? q : q.where('user_id', query.userId))
				.select(
					'id',
					database.raw('"deduction" as type'),
					database.raw('DATE_FORMAT(date, "%Y-%m-%d") as date_created'),
					'amount',
					database.raw('NULL as reason'),
					database.raw('NULL as meta'),
				));
		}

		if (queriedTypes.includes('additions')) {
			if (queriedReasons.includes('adopted-probes')) {
				sqlQueries.push(database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.modify(q => query.userId === 'all' ? q : q.where('directus_users.id', query.userId))
					.select(
						'gp_credits_additions.id',
						database.raw('"addition" as type'),
						database.raw('DATE_FORMAT(gp_credits_additions.date_created, "%Y-%m-%d") as date_created'),
						database.raw('SUM(gp_credits_additions.amount) as amount'),
						'gp_credits_additions.reason',
						database.raw('NULL as meta'),
					)
					.where('gp_credits_additions.reason', 'adopted_probe')
					.groupByRaw('DATE(gp_credits_additions.date_created)'));
			}

			const additionReasons = getAdditionReasonsFromQuery(queriedReasons);

			if (additionReasons.length) {
				sqlQueries.push(database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.modify(q => query.userId === 'all' ? q : q.where('directus_users.id', query.userId))
					.select(
						'gp_credits_additions.id',
						database.raw('"addition" as type'),
						database.raw('DATE_FORMAT(gp_credits_additions.date_created, "%Y-%m-%d") as date_created'),
						'gp_credits_additions.amount',
						'gp_credits_additions.reason',
						'gp_credits_additions.meta',
					)
					.whereIn('gp_credits_additions.reason', additionReasons));
			}
		}

		const changesSql = database.unionAll(sqlQueries);

		const countSql = database.from(changesSql.clone().as('changes')).select(database.raw('count(*) over () as count')).first() as Promise<{ count: number } | undefined>;
		const changesPageSql = changesSql
			.select('*')
			.orderBy([{ column: 'date_created', order: 'desc' }, { column: 'type', order: 'desc' }])
			.limit(query.limit).offset(query.offset) as Promise<CreditsChange[]>;

		const [ { count } = { count: 0 }, changes ] = await Promise.all([ countSql, changesPageSql ]);

		changes.forEach((change) => { change.meta = JSON.parse(change.meta); });
		res.send({ changes, count });
	}, context));
});
