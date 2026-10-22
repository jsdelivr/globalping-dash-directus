import { defineHook } from '@directus/extensions-sdk';
import type { NextFunction, Request, Response } from 'express';

export default defineHook(({ init }, { env }) => {
	if (env.ENABLE_E2E_MOCKS !== true) {
		return;
	}

	// Directus authenticates every request before the extension runs and rejects a bearer token it does not know,
	// so the GitHub token the clients send has to move from the Authorization header. The mock reads it from x-github-authorization then.
	init('middlewares.before', ({ app }) => {
		app.use((req: Request, _res: Response, next: NextFunction) => {
			if (req.path.startsWith('/e2e-mocks/github') && req.headers.authorization) {
				req.headers['x-github-authorization'] = req.headers.authorization;
				delete req.headers.authorization;
			}

			next();
		});
	});
});
