import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { getAccountGithubId } from '../../../lib/src/accounts.js';
import { getUserBonus } from '../../../lib/src/add-credits.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { validate } from '../../../lib/src/middlewares/validate.js';

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
		accountId: Joi.string().required(),
		to: Joi.string().optional(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	router.get('/', validate(sponsorshipDetailsSchema, { roles: [ 'admin', 'member', 'viewer' ], context }), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const query = req.query as unknown as { accountId: string; to?: string };
		const { accountId } = query;
		const endDate = Date.parse(query.to!) ? new Date(query.to!) : new Date();
		const githubId = await getAccountGithubId(accountId, context);
		const { bonus, dollarsInLastYear, dollarsByMonth } = await getUserBonus(githubId, 0, context, endDate);

		res.send({
			bonus,
			donatedInLastYear: dollarsInLastYear,
			donatedByMonth: dollarsByMonth,
		});
	}, context));
});
