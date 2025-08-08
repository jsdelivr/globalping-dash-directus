import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request, Response } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { generateBytes } from '../../../lib/src/bytes.js';
import { validate } from '../../../lib/src/middlewares/validate.js';

type DirectusRequest = Request & {
	accountability?: {
		user: string | null;
	};
	body: {
		size?: 'md' | 'lg';
	};
};

const bytesSchema = Joi.object<DirectusRequest>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		size: Joi.string().valid('md', 'lg').default('md'),
	}).default(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	router.post('/', validate(bytesSchema), asyncWrapper(async (req: Request, res: Response) => {
		const bytesAmount = req.body.size === 'lg' ? 30 : undefined;
		const byteString = await generateBytes(bytesAmount);
		res.send({
			data: byteString,
		});
	}, context));
});
