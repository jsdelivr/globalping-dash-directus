import { isDirectusError } from '@directus/errors';
import { ApiExtensionContext } from '@directus/extensions';
import type { Request, Response, NextFunction } from 'express';

export const asyncWrapper = (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>, context: ApiExtensionContext) => {
	return (req: Request, res: Response, next: NextFunction) => handler(req, res, next).catch((error: unknown) => {
		if (isDirectusError(error)) {
			res.status(error.status).send(error.message);
		} else {
			context.logger.error(error);
			res.status(500).send('Internal Server Error');
		}
	});
};
