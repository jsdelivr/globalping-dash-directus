import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request, Response } from 'express';
import Joi, { type ValidationError } from 'joi';
import { generateBytes } from '../utils/bytes.js';

type DirectusRequest = Request & {
	accountability?: {
		user: string | null;
	};
	body: {
		size?: 'md' | 'lg';
	};
}

const bytesSchema = Joi.object<DirectusRequest>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		size: Joi.string().valid('md', 'lg').default('md'),
	}).default(),
}).unknown(true);

export default defineEndpoint((router) => {
	router.post('/', async (request: Request, res: Response, next) => {
		const { value: req, error } = bytesSchema.validate(request) as { value: DirectusRequest, error?: ValidationError };

		if (error) {
			return next(new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))());
		}

		const bytesAmount = req.body.size === 'lg' ? 30 : 20;
		const byteString = await generateBytes(bytesAmount);
		res.send({
			data: byteString,
		});
	});
});
