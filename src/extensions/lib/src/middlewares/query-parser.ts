import type { Request, Response, NextFunction } from 'express';

interface QueryParserOptions {
	keys: string[];
}

export const queryParser = (options: QueryParserOptions) => (req: Request, _res: Response, next: NextFunction) => {
	for (const key of options.keys) {
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
