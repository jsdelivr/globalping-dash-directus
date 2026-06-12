import { defineHook } from '@directus/extensions-sdk';
import type { NextFunction, Request, Response } from 'express';

const TRUSTED_ORIGINS = [
	/^https:\/\/(?:[\w-]+\.)*globalping\.io$/,
	/^http:\/\/(?:localhost|127\.0\.0\.1):(?:13000|13010|23000|23010)$/,
];

export const isTrustedOrigin = (origin: string | undefined): boolean => {
	if (!origin) {
		return false;
	}

	try {
		const url = new URL(origin);

		if (url.origin !== origin) {
			return false;
		}
	} catch {
		return false;
	}

	return TRUSTED_ORIGINS.some(pattern => pattern.test(origin));
};

export const createCorsMiddleware = () => (req: Request, res: Response, next: NextFunction) => {
	const origin = req.headers.origin;

	if (!isTrustedOrigin(origin)) {
		next();
		return;
	}

	res.setHeader('Access-Control-Allow-Origin', origin!);
	res.setHeader('Access-Control-Allow-Credentials', 'true');
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,PUT,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
	res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
	res.setHeader('Access-Control-Max-Age', '300');
	res.setHeader('Vary', 'Origin');

	if (req.method === 'OPTIONS') {
		res.sendStatus(204);
		return;
	}

	next();
};

export default defineHook(({ init }) => {
	init('middlewares.before', ({ app }) => {
		app.use(createCorsMiddleware());
	});
});
