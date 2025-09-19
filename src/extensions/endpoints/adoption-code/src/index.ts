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
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { checkFirmwareVersions } from '../../../lib/src/check-firmware-versions.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { createAdoptedProbe, findAdoptedProbeByIp } from './repositories/directus.js';

type Override<Type, NewType> = Omit<Type, keyof NewType> & NewType;

export type Request = ExpressRequest & {
	accountability: {
		user: string;
		admin: boolean;
	};
	schema: object;
};

export type ProbeToAdopt = {
	ip: string;
	altIps: string[];
	name: null;
	uuid: string;
	version: string;
	nodeVersion: string;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	userId: null;
	tags: string[];
	systemTags: string[];
	status: string;
	city: string;
	state: string | null;
	stateName: string | null;
	country: string;
	countryName: string;
	continent: string;
	continentName: string;
	region: string;
	latitude: number;
	longitude: number;
	asn: number;
	network: string;
	isIPv4Supported: boolean;
	isIPv6Supported: boolean;
	allowedCountries: string[];
	originalLocation: null;
	customLocation: null;
};

export type AdoptedProbe = Override<ProbeToAdopt, {
	id: string;
	userId: string;
	name: string | null;
	lastSyncDate: Date;
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	customLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	isOutdated: boolean;
}>;

export type Row = Override<AdoptedProbe, {
	tags: string;
	altIps: string;
	systemTags: string;
	allowedCountries: string;
	isIPv4Supported: number;
	isIPv6Supported: number;
	originalLocation: string | null;
	customLocation: string | null;
	isOutdated: number;
}>;

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
		userId: Joi.string().required(),
		ip: Joi.string().ip({ cidr: 'forbidden' }).required(),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context) => {
	const { env } = context;
	router.post('/send-code', validate(sendCodeSchema), asyncWrapper(async (_req, res) => {
		try {
			const req = _req as Request;
			const userId = req.body.userId;
			let ip: string;

			try {
				ip = ipaddr.parse(req.body.ip).toString();
			} catch {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe IP address format is wrong', 400))();
			}

			await rateLimiter.consume(req.accountability.user, 1).catch(() => { throw new TooManyRequestsError(); });

			const adoptedProbe = await findAdoptedProbeByIp(ip, context as unknown as EndpointExtensionContext);

			if (adoptedProbe) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe with this IP address is already adopted', 400))();
			}

			if (env.ENABLE_E2E_MOCKS === true) {
				probesToAdopt.set(userId, {
					code: '111111',
					probe: {
						ip,
						altIps: [],
						uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8',
						name: null,
						userId: null,
						version: '0.28.0',
						nodeVersion: 'v22.16.0',
						hardwareDevice: null,
						hardwareDeviceFirmware: null,
						tags: [],
						systemTags: [],
						status: 'offline',
						allowedCountries: [ 'BF' ],
						city: 'Ouagadougou',
						state: null,
						stateName: null,
						country: 'BF',
						countryName: 'Burkina Faso',
						continent: 'AF',
						continentName: 'Africa',
						region: 'Western Africa',
						latitude: 12.37,
						longitude: -1.53,
						asn: 3302,
						network: 'e2e network provider',
						isIPv4Supported: true,
						isIPv6Supported: false,
						customLocation: null,
						originalLocation: null,
					},
				});

				res.send('Code was sent to the probe.');
				return;
			}

			const code = generateRandomCode();
			const { data: probe } = await axios.post<ProbeToAdopt>(`${env.GLOBALPING_URL}/adoption-code`, {
				ip,
				code,
			}, {
				headers: {
					'X-Api-Key': env.GP_SYSTEM_KEY,
				},
				timeout: 5000,
			});

			probesToAdopt.set(userId, {
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
			userId: Joi.string().required(),
			code: Joi.string().required(),
		}).required(),
	}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

	router.post('/verify-code', validate(verifyCodeSchema), asyncWrapper(async (_req, res) => {
		const req = _req as Request;

		const userId = req.body.userId;
		const userCode = req.body.code.replaceAll(' ', '');

		await rateLimiter.consume(req.accountability.user, 1).catch(() => { throw new TooManyRequestsError(); });

		const value = probesToAdopt.get(userId);

		if (!value || value.code !== userCode) {
			throw new InvalidCodeError();
		}

		const probe = value.probe;
		const adoptedProbe = await createAdoptedProbe(userId, probe, context);

		probesToAdopt.delete(userId);
		await rateLimiter.delete(req.accountability.user);

		await checkFirmwareVersions(adoptedProbe, userId, context);

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

		if (req.headers['x-api-key'] !== env.GP_SYSTEM_KEY) {
			throw new (createError('FORBIDDEN', 'Invalid system token', 403))();
		}

		const probe = req.body.probe as ProbeToAdopt;
		const user = req.body.user as { id: string };
		const adoptedProbe = await createAdoptedProbe(user.id, probe, context);
		await checkFirmwareVersions(adoptedProbe, user.id, context);

		res.sendStatus(200);
	}, context));
});
