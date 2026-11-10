import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { filterOrgIdsByBeingAdmin } from '../../../lib/src/accounts.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { NotFoundError, readBody, removeBanner, uploadBanner } from './actions/banner.js';
import { getPublicOrg, getPublicOrgs } from './actions/public-orgs.js';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

const NotAdminError = createError('FORBIDDEN', 'Only the admins of the organization can change its banner.', 403);

const bannerSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	params: Joi.object({ id: Joi.string().guid().required() }).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const authorize = async (req: Request) => {
		const orgId = req.params.id!;

		if (req.accountability.admin) {
			return;
		}

		const adminOf = await filterOrgIdsByBeingAdmin([ orgId ], req.accountability.user!, context.database);

		if (!adminOf.has(orgId)) {
			throw new NotAdminError();
		}
	};

	router.get('/', asyncWrapper(async (_req, res) => {
		res.send(await getPublicOrgs(context));
	}, context));

	router.get('/:name', asyncWrapper(async (req, res) => {
		const org = await getPublicOrg(req.params.name!, context);

		if (!org) {
			throw new NotFoundError();
		}

		res.send(org);
	}, context));

	router.post('/:id/banner', validate(bannerSchema), asyncWrapper(async (req, res) => {
		await authorize(req as Request);
		res.send({ bannerId: await uploadBanner(req.params.id!, await readBody(req), context) });
	}, context));

	router.delete('/:id/banner', validate(bannerSchema), asyncWrapper(async (req, res) => {
		await authorize(req as Request);
		await removeBanner(req.params.id!, context);

		res.send('Banner removed.');
	}, context));
});
