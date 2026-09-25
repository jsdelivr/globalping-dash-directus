import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { getAccountGithubId, getRequestAccountId } from '../../../lib/src/accounts.js';
import { getUserBonus } from '../../../lib/src/add-credits.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
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
		// PHASE5: remove `userId`, `accountId` is the only owner input.
		userId: Joi.string(),
		accountId: Joi.string(),
		to: Joi.string().optional(),
	}).xor('userId', 'accountId').required(),
}).custom(allowOnlyForCurrentUserAndAdmin('query')).unknown(true); // PHASE5: remove allowOnlyForCurrentUserAndAdmin.

export default defineEndpoint((router, context) => {
	router.get('/', validate(sponsorshipDetailsSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const query = req.query as unknown as { userId?: string; accountId?: string; to?: string };
		const accountId = await getRequestAccountId(query, req.accountability, context, [ 'admin', 'member', 'viewer' ]);
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
