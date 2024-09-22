import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';

type Request = ExpressRequest & {
	accountability: EventContext['accountability'];
};

type CreditsChange = {
	id: string;
	type: 'addition' | 'deduction';
	date_created: string;
	comment?: string;
	amount: number;
	adopted_probe?: number | null;
};

const creditsTimelineSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	query: Joi.object({
		offset: Joi.number().optional().default(0),
		limit: Joi.number().optional().max(100).default(10),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { database, logger } = context;

	router.get('/', async (req, res) => {
		try {
			const { value, error } = creditsTimelineSchema.validate(req, { convert: true });

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const query = value.query as unknown as {offset: number, limit: number};

			const changes = await database.with('rows', database.unionAll([
				database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.where('directus_users.id', value.accountability!.user!)
					.select(
						'gp_credits_additions.id',
						database.raw('"addition" as type'),
						'gp_credits_additions.date_created',
						'gp_credits_additions.amount',
						'gp_credits_additions.comment',
					),
				database('gp_credits_deductions')
					.where('user_id', value.accountability!.user!)
					.select(
						'id',
						database.raw('"deduction" as type'),
						database.raw('date as date_created'),
						'amount',
						database.raw('NULL as comment'),
					),
			]))
				.select('*')
				.from('rows')
				.orderBy([{ column: 'date_created', order: 'desc' }, { column: 'type', order: 'desc' }])
				.limit(query.limit).offset(query.offset) as CreditsChange[];

			res.send({ changes });
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
