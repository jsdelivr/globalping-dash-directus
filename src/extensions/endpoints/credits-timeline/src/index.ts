import type { Request as ExpressRequest } from 'express';
import type { EventContext } from '@directus/types';
import { defineEndpoint } from '@directus/extensions-sdk';
import { createError, isDirectusError } from '@directus/errors';
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

const a = 1;

const creditsTimelineSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	query: Joi.object({
		offset: Joi.number().optional().default(0),
		limit: Joi.number().optional().default(50),
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

			const changes = await database.unionAll([
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
			]).orderBy('date_created', 'desc').limit(query.limit).offset(query.offset) as CreditsChange[];

			const firstChange = changes[changes.length - 1];

			let [ [{ totalAdditions }], [{ totalDeductions }] ] = await Promise.all([
				database('gp_credits_additions')
					.join('directus_users', 'gp_credits_additions.github_id', 'directus_users.external_identifier')
					.sum('gp_credits_additions.amount as totalAdditions')
					.where('directus_users.id', value.accountability!.user!)
					.andWhere('gp_credits_additions.date_created', '<', firstChange ? firstChange.date_created : database.raw('NOW()')) as unknown as [{ totalAdditions: number }],
				database('gp_credits_deductions')
					.where('user_id', value.accountability!.user!)
					.sum('amount as totalDeductions')
					.where('date', '<', firstChange ? firstChange.date_created : database.raw('NOW()')) as unknown as [{ totalDeductions: number }],
			]);

			totalAdditions = totalAdditions ?? 0;
			totalDeductions = totalDeductions ?? 0;

			res.send({ amountBeforeChanges: totalAdditions - totalDeductions, changes });
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
