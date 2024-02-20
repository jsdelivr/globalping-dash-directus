import type { Request as ExpressRequest } from 'express';
import axios from 'axios';
import TTLCache from '@isaacs/ttlcache';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import Joi from 'joi';

type Request = ExpressRequest & {
	accountability: {
		user: string;
	},
	schema: object,
};

type SendCodeResponse = {
	uuid: string;
	version: string;
	isHardware: boolean;
	hardwareDevice: string | null;
	status: string;
	city: string;
	state?: string;
	country: string;
	latitude: number;
	longitude: number;
	asn: number;
	network: string;
}

type AdoptedProbe = Omit<SendCodeResponse, 'ip' | 'code' | 'state'> & {
	ip: string,
	code: string,
	state: string | null
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
		ip: Joi.string().ip().required(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, { env, logger, services }) => {
	router.post('/send-code', async (req, res) => {
		try {
			const { value, error } = sendCodeSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = value.accountability.user;
			const ip = value.body.ip as string;

			await rateLimiter.consume(userId, 1).catch(() => { throw new TooManyRequestsError(); });

			const code = generateRandomCode();

			const response = await axios.post<SendCodeResponse>(`${env.GLOBALPING_URL}/adoption-code?systemkey=${env.GP_SYSTEM_KEY}`, {
				ip,
				code,
			}, {
				timeout: 5000,
			});

			probesToAdopt.set(userId, {
				ip,
				code,
				uuid: response.data.uuid,
				version: response.data.version,
				isHardware: response.data.isHardware,
				hardwareDevice: response.data.hardwareDevice || null,
				status: response.data.status,
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
				res.status(400).send(error.response?.data?.error?.message);
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

	router.post('/verify-code', async (req, res) => {
		try {
			const { value, error } = verifyCodeSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const userId = value.accountability.user;
			const userCode = value.body.code.replaceAll(' ', '');

			await rateLimiter.consume(userId, 1).catch(() => { throw new TooManyRequestsError(); });

			const probe = probesToAdopt.get(userId);

			if (!probe || probe.code !== userCode) {
				throw new InvalidCodeError();
			}

			const itemsService = new services.ItemsService('gp_adopted_probes', {
				schema: value.schema,
			});

			await itemsService.createOne({
				ip: probe.ip,
				uuid: probe.uuid,
				version: probe.version,
				isHardware: probe.isHardware,
				hardwareDevice: probe.hardwareDevice,
				status: probe.status,
				city: probe.city,
				state: probe.state,
				country: probe.country,
				latitude: probe.latitude,
				longitude: probe.longitude,
				asn: probe.asn,
				network: probe.network,
				userId,
				lastSyncDate: new Date(),
			});

			probesToAdopt.delete(userId);
			await rateLimiter.delete(userId);
			res.send('Code successfully validated. Probe was assigned to you.');
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
