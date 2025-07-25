import { createError, isDirectusError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { defineEndpoint } from '@directus/extensions-sdk';
import TTLCache from '@isaacs/ttlcache';
import axios from 'axios';
import type { Request as ExpressRequest } from 'express';
// eslint-disable-next-line n/no-missing-import
import ipaddr from 'ipaddr.js';
import Joi from 'joi';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { checkFirmwareVersions } from '../../../lib/src/check-firmware-versions.js';
import { allowOnlyForCurrentUserAndAdmin } from '../../../lib/src/joi-validators.js';
import { createAdoptedProbe, findAdoptedProbeByIp } from './repositories/directus.js';

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
	name: string | null;
	uuid: string | null;
	version: string | null;
	nodeVersion: string | null;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	systemTags: string[];
	status: string;
	city: string | null;
	state: string | null;
	stateName: string | null;
	country: string | null;
	countryName: string | null;
	continent: string | null;
	continentName: string | null;
	region: string | null;
	latitude: number | null;
	longitude: number | null;
	asn: number | null;
	network: string | null;
	isIPv4Supported: boolean;
	isIPv6Supported: boolean;
};

export type AdoptedProbe = ProbeToAdopt & {
	id: string;
	userId: string;
	lastSyncDate: Date;
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
		userId: Joi.string().required(),
		ip: Joi.string().ip({ cidr: 'forbidden' }).required(),
	}).required(),
}).custom(allowOnlyForCurrentUserAndAdmin('body')).unknown(true);

export default defineEndpoint((router, context) => {
	const { env, logger } = context;
	router.post('/send-code', async (req, res) => {
		try {
			const { value, error } = sendCodeSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = value.body.userId;
			let ip: string;

			try {
				ip = ipaddr.parse(value.body.ip).toString();
			} catch {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe IP address format is wrong', 400))();
			}

			await rateLimiter.consume(value.accountability.user, 1).catch(() => { throw new TooManyRequestsError(); });

			const adoptedProbe = await findAdoptedProbeByIp(ip, context as unknown as EndpointExtensionContext);

			if (adoptedProbe) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'The probe with this IP address is already adopted', 400))();
			}

			const code = generateRandomCode();

			// Allowing user to adopt the probe with default values, even if there was no response from GP API.
			probesToAdopt.set(userId, {
				code,
				probe: {
					ip,
					altIps: [],
					name: null,
					uuid: null,
					version: null,
					nodeVersion: null,
					hardwareDevice: null,
					hardwareDeviceFirmware: null,
					systemTags: [],
					status: 'offline',
					city: null,
					state: null,
					stateName: null,
					country: null,
					countryName: null,
					continent: null,
					continentName: null,
					region: null,
					latitude: null,
					longitude: null,
					asn: null,
					network: null,
					isIPv4Supported: false,
					isIPv6Supported: false,
				},
			});

			if (env.ENABLE_E2E_MOCKS === true) {
				probesToAdopt.set(userId, {
					code: '111111',
					probe: {
						ip,
						altIps: [],
						name: null,
						uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8',
						version: '0.28.0',
						nodeVersion: null,
						hardwareDevice: null,
						hardwareDeviceFirmware: null,
						systemTags: [],
						status: 'offline',
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
					},
				});

				res.send('Code was sent to the probe.');
				return;
			}

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
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else if (axios.isAxiosError(error)) {
				const message = error.response?.status === 422 ? 'No matching probes found' : error.message;
				res.status(400).send(message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});

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

	router.post('/verify-code', async (request, res) => {
		try {
			const { value: req, error } = verifyCodeSchema.validate(request);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

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
				name: adoptedProbe.name,
				ip: probe.ip,
				version: probe.version,
				nodeVersion: probe.nodeVersion,
				hardwareDevice: probe.hardwareDevice,
				hardwareDeviceFirmware: probe.hardwareDeviceFirmware,
				systemTags: probe.systemTags,
				status: probe.status,
				city: probe.city,
				state: probe.state,
				stateName: probe.stateName,
				country: probe.country,
				countryName: probe.countryName,
				continent: probe.continent,
				continentName: probe.continentName,
				region: probe.region,
				latitude: probe.latitude,
				longitude: probe.longitude,
				asn: probe.asn,
				network: probe.network,
				lastSyncDate: new Date(),
				isIPv4Supported: probe.isIPv4Supported,
				isIPv6Supported: probe.isIPv6Supported,
			});
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});

	router.put('/adopt-by-token', async (request, res) => {
		try {
			if (request.headers['x-api-key'] !== env.GP_SYSTEM_KEY) {
				throw new (createError('FORBIDDEN', 'Invalid system token', 403))();
			}

			const probe = request.body.probe as ProbeToAdopt;
			const user = request.body.user as { id: string };
			const adoptedProbe = await createAdoptedProbe(user.id, probe, context);
			await checkFirmwareVersions(adoptedProbe, user.id, context);

			res.sendStatus(200);
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
