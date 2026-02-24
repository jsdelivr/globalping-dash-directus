import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Accountability } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getIpFromRequest } from '../../../lib/src/client-ip.js';
import { validate } from '../../../lib/src/middlewares/validate.js';

type Request = ExpressRequest & {
	accountability: Accountability;
};

const adoptLocalProbeSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		token: Joi.string().required(),
	}).required(),
}).unknown(true);

const getClientIp = (req: ExpressRequest) => {
	const clientIp = getIpFromRequest(req);

	if (!clientIp) {
		throw new (createError('INVALID_IP', 'Client IP could not be determined.', 400))();
	}

	return clientIp;
};

export default defineEndpoint((router, context) => {
	const { getSchema, services, database } = context;

	router.get('/', asyncWrapper(async (req, res) => {
		const clientIp = getClientIp(req);

		const unadoptedProbes = await database('gp_probes')
			.whereNull('userId')
			.whereNotNull('localAdoptionServer')
			.where('status', 'ready')
			.where((query) => {
				query.where('ip', clientIp)
					.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ `"${clientIp}"` ]);
			});

		unadoptedProbes.forEach((probe) => {
			probe.localAdoptionServer = JSON.parse(probe.localAdoptionServer);
		});

		const ips = unadoptedProbes.flatMap(probe => probe.localAdoptionServer.ips);

		res.set('Cache-Control', 'no-store, private');
		res.send(ips);
	}, context));

	router.get('/:token', asyncWrapper(async (req, res) => {
		const { token } = req.params;
		const clientIp = getClientIp(req);

		const probe = await database('gp_probes')
			.select('country', 'city', 'network', 'ip')
			.whereNull('userId')
			.whereNotNull('localAdoptionServer')
			.where('status', 'ready')
			.where((query) => {
				query.where('ip', clientIp)
					.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ `"${clientIp}"` ]);
			})
			.whereRaw('JSON_VALUE(localAdoptionServer, "$.token") = ?', [ token ])
			.first();

		if (!probe) {
			throw new (createError('NOT_FOUND', 'Probe not found or not available for adoption.', 404))();
		}

		res.json(probe);
	}, context));

	router.post('/adopt', validate(adoptLocalProbeSchema), asyncWrapper(async (eReq: ExpressRequest, res) => {
		const req = eReq as Request;
		const clientIp = getClientIp(req);

		const updatedProbe = await database.transaction(async (trx) => {
			const probe = await database('gp_probes')
				.transacting(trx)
				.forUpdate()
				.whereNull('userId')
				.whereNotNull('localAdoptionServer')
				.where('status', 'ready')
				.where((query) => {
					query.where('ip', clientIp)
						.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ `"${clientIp}"` ]);
				})
				.whereRaw('JSON_VALUE(localAdoptionServer, "$.token") = ?', [ req.body.token ])
				.first();

			if (!probe) {
				throw new (createError('NOT_FOUND', 'No probe with a matching token found.', 404))();
			}

			const probesService = new services.ItemsService('gp_probes', {
				schema: await getSchema(),
				knex: trx,
			});

			await probesService.updateOne(probe.id, {
				userId: req.accountability.user,
			}, { emitEvents: false });

			return probesService.readOne(probe.id);
		});

		res.json(updatedProbe);
	}, context));
});
