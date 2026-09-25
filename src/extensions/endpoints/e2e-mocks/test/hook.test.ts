import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import hook from '../src/hook/index.js';

const createApp = (enabled: boolean) => {
	const app = express();
	const init = (event: string, handler: (meta: { app: express.Express }) => void) => event === 'middlewares.before' && handler({ app });
	(hook as any)({ init }, { env: { ENABLE_E2E_MOCKS: enabled } } as unknown as HookExtensionContext);
	app.use((req, res) => res.send({ authorization: req.headers.authorization ?? null, github: req.headers['x-github-authorization'] ?? null }));
	return app;
};

describe('e2e-mocks hook', () => {
	it('should move the GitHub token aside on the GitHub mock routes', async () => {
		const res = await request(createApp(true)).get('/e2e-mocks/github/user/memberships/orgs').set('Authorization', 'Bearer user-token');
		expect(res.body).to.deep.equal({ authorization: null, github: 'Bearer user-token' });
	});

	it('should leave the authorization of every other route to Directus', async () => {
		const res = await request(createApp(true)).get('/items/gp_probes').set('Authorization', 'Bearer directus-token');
		expect(res.body).to.deep.equal({ authorization: 'Bearer directus-token', github: null });
	});

	it('should do nothing unless the mocks are enabled', async () => {
		const res = await request(createApp(false)).get('/e2e-mocks/github/user/memberships/orgs').set('Authorization', 'Bearer user-token');
		expect(res.body).to.deep.equal({ authorization: 'Bearer user-token', github: null });
	});
});
