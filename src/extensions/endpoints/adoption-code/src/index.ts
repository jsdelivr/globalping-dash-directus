import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { defineEndpoint } from '@directus/extensions-sdk';
import TTLCache from '@isaacs/ttlcache';
import axios from 'axios';
import type { Request as ExpressRequest } from 'express';
// eslint-disable-next-line n/no-missing-import
import ipaddr from 'ipaddr.js';
import Joi from 'joi';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { getRequestAccountId } from '../../../lib/src/accounts.js';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { checkFirmwareVersions } from '../../../lib/src/check-firmware-versions.js';
import { SYSTEM_USER_ID } from '../../../lib/src/constants.js';
import { createAdoptedProbe, type ProbeToAdopt } from '../../../lib/src/create-adopted-probe.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { getGlobalpingApiUrl } from '../../../lib/src/service-urls.js';
import { findAdoptedProbeByIp } from './repositories/directus.js';

export type Request = ExpressRequest & {
	accountability?: {
		user: string;
		admin: boolean;
		role: string;
	};
	schema: object;
};

const InvalidCodeError = createError('INVALID_PAYLOAD_ERROR', 'Invalid code', 400);
const TooManyRequestsError = createError('TOO_MANY_REQUESTS', 'Too many requests', 429);

const rateLimiter = new RateLimiterMemory({
	points: 20,
	duration: 30 * 60,
});

const probesToAdopt = new TTLCache<string, { code: string; probe: ProbeToAdopt }>({ ttl: 30 * 60 * 1000 });

const generateRandomCode = () => {
	const randomNumber = Math.floor(Math.random() * 1000000);
	const randomCode = randomNumber.toString().padStart(6, '0');
	return randomCode;
};

const sendCodeSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
		admin: Joi.boolean().required(),
	}).required().unknown(true),
	body: Joi.object({
		// PHASE4: remove `userId`, `accountId` is the only owner input.
		userId: Joi.string(),
		accountId: Joi.string(),
		ip: Joi.string().ip({ cidr: 'forbidden' }).required(),
	}).xor('userId', 'accountId').required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context) => {
	const { env } = context;
	router.post('/send-code', validate(sendCodeSchema), asyncWrapper(async (_req, res) => {
		try {
			const req = _req as Request;
			const accountId = await getRequestAccountId(req.body, req.accountability!, context);
			let ip: string;

			try {
				ip = ipaddr.parse(req.body.ip).toString();
			} catch {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe IP address format is wrong', 400))();
			}

			await rateLimiter.consume(req.accountability?.user ?? '', 1).catch(() => { throw new TooManyRequestsError(); });

			const adoptedProbe = await findAdoptedProbeByIp(ip, context as unknown as EndpointExtensionContext);

			if (adoptedProbe) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe with this IP address is already adopted', 400))();
			}

			const code = generateRandomCode();
			const { data: probe } = await axios.post<ProbeToAdopt>(`${getGlobalpingApiUrl(context)}/adoption-code`, {
				ip,
				code,
			}, {
				headers: {
					'X-Api-Key': env.GP_SYSTEM_KEY,
				},
				timeout: 5000,
			});

			probesToAdopt.set(accountId, {
				code,
				probe,
			});

			res.send('Code was sent to the probe.');
		} catch (error: unknown) {
			if (axios.isAxiosError(error) && error.response?.status === 422) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'No matching probes found', 400))();
			} else {
				throw error;
			}
		}
	}, context));

	const verifyCodeSchema = Joi.object<Request>({
		accountability: Joi.object({
			user: Joi.string().required(),
			admin: Joi.boolean().required(),
		}).required().unknown(true),
		body: Joi.object({
			// PHASE4: remove `userId`, `accountId` is the only owner input (required).
			userId: Joi.string(),
			accountId: Joi.string(),
			code: Joi.string().required(),
		}).xor('userId', 'accountId').required(),
	}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

	router.post('/verify-code', validate(verifyCodeSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;

		const accountId = await getRequestAccountId(req.body, req.accountability!, context);
		const userCode = req.body.code.replaceAll(' ', '');

		await rateLimiter.consume(req.accountability?.user ?? '', 1).catch(() => { throw new TooManyRequestsError(); });

		const value = probesToAdopt.get(accountId);

		if (!value || value.code !== userCode) {
			throw new InvalidCodeError();
		}

		const probe = value.probe;
		const adoptedProbe = await createAdoptedProbe(accountId, probe, context);

		probesToAdopt.delete(accountId);
		await rateLimiter.delete(req.accountability?.user ?? '');

		await checkFirmwareVersions([ adoptedProbe ], adoptedProbe.account_id, context).catch((error) => { context.logger.error(error); });

		res.send({
			id: adoptedProbe.id,
			ip: adoptedProbe.ip,
			uuid: adoptedProbe.uuid,
			altIps: adoptedProbe.altIps,
			name: adoptedProbe.name,
			version: adoptedProbe.version,
			nodeVersion: adoptedProbe.nodeVersion,
			hardwareDevice: adoptedProbe.hardwareDevice,
			hardwareDeviceFirmware: adoptedProbe.hardwareDeviceFirmware,
			tags: adoptedProbe.tags,
			systemTags: adoptedProbe.systemTags,
			status: adoptedProbe.status,
			allowedCountries: adoptedProbe.allowedCountries,
			city: adoptedProbe.city,
			state: adoptedProbe.state,
			stateName: adoptedProbe.stateName,
			country: adoptedProbe.country,
			countryName: adoptedProbe.countryName,
			continent: adoptedProbe.continent,
			continentName: adoptedProbe.continentName,
			region: adoptedProbe.region,
			latitude: adoptedProbe.latitude,
			longitude: adoptedProbe.longitude,
			asn: adoptedProbe.asn,
			network: adoptedProbe.network,
			lastSyncDate: adoptedProbe.lastSyncDate,
			isIPv4Supported: adoptedProbe.isIPv4Supported,
			isIPv6Supported: adoptedProbe.isIPv6Supported,
			isOutdated: adoptedProbe.isOutdated,
			originalLocation: adoptedProbe.originalLocation,
			customLocation: adoptedProbe.customLocation,
		});
	}, context));

	router.put('/adopt-by-token', asyncWrapper(async (_req, res) => {
		const req = _req as Request;

		if (req.accountability?.user !== SYSTEM_USER_ID) {
			throw new (createError('FORBIDDEN', 'Invalid system token', 403))();
		}

		const probe = req.body.probe as ProbeToAdopt;
		// PHASE4: remove the legacy `user` input, gp-api passes the account.
		const account = req.body.account as { id: string } | undefined;
		const user = req.body.user as { id: string } | undefined;
		const accountId = await getRequestAccountId({ accountId: account?.id, userId: user?.id }, { admin: true }, context);
		const adoptedProbe = await createAdoptedProbe(accountId, probe, context);
		await checkFirmwareVersions([ adoptedProbe ], adoptedProbe.account_id, context).catch((error) => { context.logger.error(error); });

		res.sendStatus(200);
	}, context));
});
