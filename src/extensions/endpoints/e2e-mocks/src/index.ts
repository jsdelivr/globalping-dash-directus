import { defineEndpoint } from '@directus/extensions-sdk';
import { githubRoutes } from './actions/github.js';
import { globalpingRoutes } from './actions/globalping.js';

// The external services the dashboard talks to, replaced by routes of its own so that the e2e tests can drive them.
export default defineEndpoint((router, { env }) => {
	if (env.ENABLE_E2E_MOCKS !== true) {
		return;
	}

	githubRoutes(router);
	globalpingRoutes(router, env);
});
