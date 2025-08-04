import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { createError } from '@directus/errors';

export const validate = (schema: Joi.ObjectSchema) => (req: Request, _res: Response, next: NextFunction) => {
	const { value, error } = schema.validate(req);

	if (error) {
		throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
	}

	value.body && (req.body = value.body);
	value.query && (req.query = value.query);
	next();
};
