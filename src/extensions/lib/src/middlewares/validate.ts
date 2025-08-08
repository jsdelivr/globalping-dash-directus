import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema) => (req: Request, res: Response, next: NextFunction) => {
	const { value, error } = schema.validate(req);

	if (error) {
		res.status(400).send(error.message);
		return;
	}

	value.body && (req.body = value.body);
	value.query && (req.query = value.query);
	next();
};
