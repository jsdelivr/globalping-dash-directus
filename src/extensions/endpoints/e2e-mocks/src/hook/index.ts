import { defineHook } from '@directus/extensions-sdk';
import type { NextFunction, Request, Response } from 'express';
import { GITHUB_AUTHORIZATION_HEADER } from '../actions/github.js';

// This extension accepts GitHub requests and either responds with a mock or forwards to the actual GitHub API. The problem is that both GitHub and Directus take a `Bearer` authorization token as a token for their own authentication, so when GitHub token is sent to Directus, it is rejected. To work around this, the GitHub token is moved to a header that Directus does not read, then that token is put back into the correct header for GitHub.
export default defineHook(({ init }, { env }) => {
	if (env.ENABLE_E2E_MOCKS !== true) {
		return;
	}

	init('middlewares.before', ({ app }) => {
		app.use('/e2e-mocks/github', (req: Request, _res: Response, next: NextFunction) => {
			req.headers[GITHUB_AUTHORIZATION_HEADER] = req.headers.authorization;
			delete req.headers.authorization;
			next();
		});
	});
});
