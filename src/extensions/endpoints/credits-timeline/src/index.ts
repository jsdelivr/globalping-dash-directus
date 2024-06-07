import type { Request as ExpressRequest } from 'express';
import { defineEndpoint } from '@directus/extensions-sdk';
import { createError, isDirectusError } from '@directus/errors';
import Joi from 'joi';

type Request = ExpressRequest & {
	accountability: {
		user: string;
	},
	schema: object,
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
		limit: Joi.number().optional().default(50),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, { database, logger }) => {
	router.get('/', async (req, res) => {
		try {
			const { value, error } = creditsTimelineSchema.validate(req, { convert: true });

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const query = value.query as unknown as {offset: number, limit: number};

			const changes = await database.unionAll([
				database('gp_credits_additions').select('id', database.raw('"addition" as type'), 'date_created', 'amount', 'comment'),
				database('gp_credits_deductions').select('id', database.raw('"deduction" as type'), database.raw('date as date_created'), 'amount', database.raw('NULL as comment')),
			]).orderBy('date_created', 'desc').limit(query.limit).offset(query.offset) as CreditsChange[];

			const firstChange = changes[changes.length - 1];

			let [ [{ totalAdditions }], [{ totalDeductions }] ] = await Promise.all([
				database('gp_credits_additions')
					.sum('amount as totalAdditions')
					.where('date_created', '<', firstChange ? firstChange.date_created : database.raw('NOW()')) as unknown as [{ totalAdditions: number }],
				database('gp_credits_deductions')
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
