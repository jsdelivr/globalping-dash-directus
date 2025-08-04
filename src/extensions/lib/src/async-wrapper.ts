import { isDirectusError } from '@directus/errors';
import type { Request, Response, NextFunction } from 'express';

export const asyncWrapper = (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
	return (req: Request, res: Response, next: NextFunction) => handler(req, res, next).catch((error: unknown) => {
		if (isDirectusError(error)) {
			res.status(error.status).send(error.message);
		} else {
			next(error);
		}
	});
};
