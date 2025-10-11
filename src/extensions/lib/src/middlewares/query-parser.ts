import type { Request, Response, NextFunction } from 'express';

export const queryParser = (req: Request, _res: Response, next: NextFunction) => {
	for (const key of Object.keys(req.query)) {
		if (typeof req.query[key] !== 'string') {
			continue;
		}

		try {
			req.query[key] = JSON.parse(req.query[key]);
		} catch {
			// keep the string value
		}
	}

	next();
};
