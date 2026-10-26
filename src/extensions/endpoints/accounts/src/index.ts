import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { ForbiddenAccountError, getAccountRole } from '../../../lib/src/accounts.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { validate } from '../../../lib/src/middlewares/validate.js';

type Request = ExpressRequest & {
	token: string;
	accountability: NonNullable<EventContext['accountability']> & { user: string; session: string };
};

const sessionSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		session: Joi.string().required(),
	}).required().unknown(true),
	token: Joi.string().required(),
}).unknown(true);

const setActiveAccountSchema = sessionSchema.keys({
	body: Joi.object({
		accountId: Joi.string().guid().required(),
	}).required(),
});

const getClaims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { active_account_id: string };

export default defineEndpoint((router, context) => {
	const { database } = context;

	router.get('/active', validate(sessionSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;

		res.send({ accountId: getClaims(req.token).active_account_id });
	}, context));

	router.post('/active', validate(setActiveAccountSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const { accountId } = req.body as { accountId: string };

		if (!await getAccountRole(accountId, req.accountability.user, database)) {
			throw new ForbiddenAccountError();
		}

		// Update both the previous and the current session, as a refresh may have rotated this one already.
		await database.raw(`
			UPDATE directus_sessions s JOIN directus_sessions d
			ON d.token = :token AND s.token IN (d.token, d.next_token)
			SET s.active_account = :account
		`, { token: req.accountability.session, account: accountId });

		res.send({ accountId });
	}, context));
});
