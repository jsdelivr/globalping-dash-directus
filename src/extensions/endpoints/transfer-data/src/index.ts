import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { getAccountGithubId, getRequestAccountId } from '../../../lib/src/accounts.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { authorize } from './actions/authorize.js';
import { getRedirects, setRedirect } from './actions/credits-redirect.js';
import { transferCredits } from './actions/transfer-credits.js';
import { transferProbes } from './actions/transfer-probes.js';
import { transferTokens } from './actions/transfer-tokens.js';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

const OrgRedirectError = createError('INVALID_PAYLOAD_ERROR', 'An organization can not redirect credits, only user can.', 400);
const ForeignRedirectError = createError('FORBIDDEN', 'A redirect can only be removed by one of its two sides.', 403);

const accountability = Joi.object({
	user: Joi.string().required(),
	admin: Joi.boolean().required(),
}).required().unknown(true);

const transferSchema = Joi.object<Request>({
	accountability,
	body: Joi.object({ orgId: Joi.string().required() }).required(),
}).unknown(true);

const getRedirectSchema = Joi.object<Request>({
	accountability,
	query: Joi.object({ accountId: Joi.string().required() }).required(),
}).unknown(true);

const deleteRedirectSchema = Joi.object<Request>({
	accountability,
	body: Joi.object({ accountId: Joi.string().required(), source: Joi.string().required(), target: Joi.string().required() }).required(),
}).unknown(true);

const setRedirectSchema = Joi.object<Request>({
	accountability,
	body: Joi.object({ accountId: Joi.string().required(), orgId: Joi.string().required() }).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { database } = context;

	([ [ 'probes', transferProbes ], [ 'tokens', transferTokens ], [ 'credits', transferCredits ] ] as const).forEach(([ operation, transfer ]) => {
		router.post(`/${operation}`, validate(transferSchema), asyncWrapper(async (_req, res) => {
			const req = _req as Request;
			const { orgId } = req.body as { orgId: string };

			await database.transaction(async (trx) => {
				const authorized = await authorize(orgId, req.accountability.user!, operation, trx);
				await transfer(authorized, trx);
			});

			res.send('Transferred to the organization.');
		}, context));
	});

	// Only the admins of an org read its redirect: the counterparty is a person the members can not look up anywhere else.
	router.get('/credits-redirect', validate(getRedirectSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const accountId = await getRequestAccountId(req.query as { accountId: string }, req.accountability, context);
		const githubId = await getAccountGithubId(accountId, context);

		res.send({ redirects: githubId ? await getRedirects(githubId, context) : [] });
	}, context));

	router.post('/credits-redirect', validate(setRedirectSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const body = req.body as { accountId: string; orgId: string };
		const accountId = await getRequestAccountId(body, req.accountability, context);
		const [ account, githubId ] = await Promise.all([
			database('gp_accounts').where({ id: accountId }).first<{ org: string | null }>('org'),
			getAccountGithubId(accountId, context),
		]);

		if (account.org) {
			throw new OrgRedirectError();
		}

		await database.transaction(async (trx) => {
			const { orgGithubId } = await authorize(body.orgId, req.accountability.user!, 'redirect', trx);

			await setRedirect(githubId!, orgGithubId, trx);
		});

		res.send('Credits redirect updated.');
	}, context));

	router.delete('/credits-redirect', validate(deleteRedirectSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;
		const body = req.body as { accountId: string; source: string; target: string };
		const accountId = await getRequestAccountId(body, req.accountability, context);
		const githubId = await getAccountGithubId(accountId, context);

		if (githubId !== body.source && githubId !== body.target) {
			throw new ForeignRedirectError();
		}

		await database('gp_credits_redirects').where({ source_github_id: body.source, target_github_id: body.target }).delete();

		res.send('Credits redirect removed.');
	}, context));
});
