import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Accountability } from '@directus/types';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getIpFromRequest } from '../../../lib/src/client-ip.js';
import { type Row, createAdoptedProbe, parseRow } from '../../../lib/src/create-adopted-probe.js';
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
	const { database } = context;

	router.get('/', asyncWrapper(async (req, res) => {
		const clientIp = getClientIp(req);

		const unadoptedProbes = await database('gp_probes')
			.select('country', 'city', 'network', 'ip as publicIp', 'localAdoptionServer')
			.whereNull('userId')
			.whereNotNull('localAdoptionServer')
			.where('status', 'ready')
			.where((query) => {
				query.where('ip', clientIp)
					.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ `"${clientIp}"` ]);
			});

		unadoptedProbes.forEach((probe) => {
			probe.localIps = JSON.parse(probe.localAdoptionServer)?.ips || [];
			delete probe.localAdoptionServer;
		});

		res.set('Cache-Control', 'no-store, private');
		res.send(unadoptedProbes);
	}, context));

	router.post('/adopt', validate(adoptLocalProbeSchema), asyncWrapper(async (eReq: ExpressRequest, res) => {
		const req = eReq as Request;
		const clientIp = getClientIp(req);

		const row = await database('gp_probes')
			.whereNull('userId')
			.whereNotNull('localAdoptionServer')
			.where('status', 'ready')
			.where((query) => {
				query.where('ip', clientIp)
					.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ `"${clientIp}"` ]);
			})
			.whereRaw('JSON_VALUE(localAdoptionServer, "$.token") = ?', [ req.body.token ])
			.first<Row>();

		if (!row) {
			throw new (createError('NOT_FOUND', 'No probe with a matching token found.', 404))();
		}

		const probe = parseRow(row);
		const updatedProbe = await createAdoptedProbe(req.accountability.user!, probe, context);

		res.json(updatedProbe);
	}, context));
});
