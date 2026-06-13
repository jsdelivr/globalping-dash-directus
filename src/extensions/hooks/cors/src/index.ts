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

export const addVaryOrigin = (res: Response) => {
	const currentVary = res.getHeader('Vary');

	if (!currentVary) {
		res.setHeader('Vary', 'Origin');
		return;
	}

	const values = (Array.isArray(currentVary) ? currentVary.join(',') : String(currentVary))
		.split(',')
		.map(value => value.trim())
		.filter(Boolean);

	if (values.some(value => value.toLowerCase() === 'origin')) {
		return;
	}

	res.setHeader('Vary', [ ...values, 'Origin' ].join(', '));
};

export const createCorsMiddleware = () => (req: Request, res: Response, next: NextFunction) => {
	const origin = req.headers.origin;
	addVaryOrigin(res);

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
