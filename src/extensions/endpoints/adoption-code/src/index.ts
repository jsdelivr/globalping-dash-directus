import { createError, isDirectusError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { defineEndpoint } from '@directus/extensions-sdk';
import TTLCache from '@isaacs/ttlcache';
import axios from 'axios';
import type { Request as ExpressRequest } from 'express';
import ipaddr from 'ipaddr.js';
import Joi from 'joi';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { createAdoptedProbe, findAdoptedProbes } from './repositories/directus.js';

export type Request = ExpressRequest & {
	accountability: {
		user: string;
	},
	schema: object,
};

type SendCodeResponse = {
	uuid: string;
	version: string;
	nodeVersion: string;
	hardwareDevice: string | null;
	status: string;
	systemTags: string[];
	city: string;
	state?: string;
	country: string;
	latitude: number;
	longitude: number;
	asn: number;
	network: string;
}

export type AdoptedProbe = {
	ip: string;
	name: string | null;
	code: string;
	uuid: string | null;
	version: string | null;
	nodeVersion: string | null;
	hardwareDevice: string | null;
	status: string;
	systemTags: string[];
	city: string | null;
	state: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
	asn: number | null;
	network: string | null;
}

const InvalidCodeError = createError('INVALID_PAYLOAD_ERROR', 'Code is not valid', 400);
const TooManyRequestsError = createError('TOO_MANY_REQUESTS', 'Too many requests', 429);

const rateLimiter = new RateLimiterMemory({
	points: 20,
	duration: 30 * 60,
});

const probesToAdopt = new TTLCache<string, AdoptedProbe>({ ttl: 30 * 60 * 1000 });

const generateRandomCode = () => {
	const randomNumber = Math.floor(Math.random() * 1000000);
	const randomCode = randomNumber.toString().padStart(6, '0');
	return randomCode;
};

const sendCodeSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		ip: Joi.string().ip({ cidr: 'forbidden' }).required(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { env, logger } = context;
	router.post('/send-code', async (req, res) => {
		try {
			const { value, error } = sendCodeSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = value.accountability.user;
			let ip: string;

			try {
				ip = ipaddr.parse(value.body.ip).toString();
			} catch (err) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'Probe ip format is wrong', 400))();
			}

			await rateLimiter.consume(userId, 1).catch(() => { throw new TooManyRequestsError(); });

			const adoptedProbes = await findAdoptedProbes({ ip }, context as unknown as EndpointExtensionContext);

			if (adoptedProbes.length > 0) {
				throw new (createError('INVALID_PAYLOAD_ERROR', 'Probe with that ip is already adopted', 400))();
			}

			const code = generateRandomCode();

			// Allowing user to adopt the probe with default values, even if there was no response from GP API.
			probesToAdopt.set(userId, {
				ip,
				name: null,
				code,
				uuid: null,
				version: null,
				nodeVersion: null,
				hardwareDevice: null,
				status: 'offline',
				systemTags: [],
				city: null,
				state: null,
				country: null,
				latitude: null,
				longitude: null,
				asn: null,
				network: null,
			});

			const response = await axios.post<SendCodeResponse>(`${env.GLOBALPING_URL}/adoption-code?systemkey=${env.GP_SYSTEM_KEY}`, {
				ip,
				code,
			}, {
				timeout: 5000,
			});

			probesToAdopt.set(userId, {
				ip,
				name: null,
				code,
				uuid: response.data.uuid,
				version: response.data.version,
				nodeVersion: response.data.nodeVersion,
				hardwareDevice: response.data.hardwareDevice || null,
				status: response.data.status,
				systemTags: response.data.systemTags,
				city: response.data.city,
				state: response.data.state || null,
				country: response.data.country,
				latitude: response.data.latitude,
				longitude: response.data.longitude,
				asn: response.data.asn,
				network: response.data.network,
			});

			res.send('Code was sent to the probe.');
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else if (axios.isAxiosError(error)) {
				const message = error.response?.status === 422 ? 'No suitable probes found' : error.message;
				res.status(400).send(message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});

	const verifyCodeSchema = Joi.object<Request>({
		accountability: Joi.object({
			user: Joi.string().required(),
		}).required().unknown(true),
		body: Joi.object({
			code: Joi.string().required(),
		}).required(),
	}).unknown(true);

	router.post('/verify-code', async (request, res) => {
		try {
			const { value: req, error } = verifyCodeSchema.validate(request);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = req.accountability.user;
			const userCode = req.body.code.replaceAll(' ', '');

			await rateLimiter.consume(userId, 1).catch(() => { throw new TooManyRequestsError(); });

			const probe = probesToAdopt.get(userId);

			if (!probe || probe.code !== userCode) {
				throw new InvalidCodeError();
			}

			const [ id, name ] = await createAdoptedProbe(req, probe, context as unknown as EndpointExtensionContext);

			probesToAdopt.delete(userId);
			await rateLimiter.delete(userId);

			res.send({
				id,
				name,
				ip: probe.ip,
				version: probe.version,
				nodeVersion: probe.nodeVersion,
				hardwareDevice: probe.hardwareDevice,
				status: probe.status,
				systemTags: probe.systemTags,
				city: probe.city,
				state: probe.state,
				country: probe.country,
				latitude: probe.latitude,
				longitude: probe.longitude,
				asn: probe.asn,
				network: probe.network,
				lastSyncDate: new Date(),
			});
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError<{ collection?: string; field?: string; } | undefined>(error) && error.code === 'RECORD_NOT_UNIQUE' && error.extensions?.field === 'adopted_probes_ip') {
				res.status(error.status).send('Probe with that ip is already adopted');
			} else if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});
});
