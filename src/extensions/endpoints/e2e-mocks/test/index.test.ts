import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express from 'express';
import nock from 'nock';
import request from 'supertest';
import hook from '../src/hook.js';
import endpoint from '../src/index.js';

const GLOBALPING_URL = 'https://api.globalping.test/v1';

const createApp = (enabled: boolean) => {
	const app = express();
	app.use(express.json());

	const router = express.Router();
	(endpoint as any)(router, { env: { ENABLE_E2E_MOCKS: enabled, GLOBALPING_URL } } as unknown as EndpointExtensionContext);
	app.use(router);

	return app;
};

describe('github-authorization hook', () => {
	const createApp = (enabled: boolean) => {
		const app = express();
		hook({ init: (_event: string, cb: (meta: { app: express.Express }) => void) => cb({ app }) } as any, { env: { ENABLE_E2E_MOCKS: enabled } } as any);
		app.use((req, res) => res.send({ authorization: req.headers.authorization ?? null, github: req.headers['x-github-authorization'] ?? null }));
		return app;
	};

	it('should move the Authorization header of the github mock routes', async () => {
		const res = await request(createApp(true)).get('/e2e-mocks/github/user').set('Authorization', 'Bearer real-token');

		expect(res.body).to.deep.equal({ authorization: null, github: 'Bearer real-token' });
	});

	it('should leave the other routes alone', async () => {
		const res = await request(createApp(true)).get('/e2e-mocks/globalping/state').set('Authorization', 'Bearer directus-token');

		expect(res.body).to.deep.equal({ authorization: 'Bearer directus-token', github: null });
	});

	it('should do nothing unless the mocks are enabled', async () => {
		const res = await request(createApp(false)).get('/e2e-mocks/github/user').set('Authorization', 'Bearer real-token');

		expect(res.body).to.deep.equal({ authorization: 'Bearer real-token', github: null });
	});
});

describe('/e2e-mocks endpoint', () => {
	const app = createApp(true);

	before(() => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
	});

	afterEach(() => {
		nock.cleanAll();
	});

	it('should register nothing unless the mocks are enabled', async () => {
		const res = await request(createApp(false)).get('/github/user/memberships/orgs');
		expect(res.status).to.equal(404);
	});

	describe('github', () => {
		const memberships = [{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }];
		const orgs = [{ id: 2, login: 'restricted-org' }];

		before(async () => {
			await request(app).post('/github/state').send({ token: 'user-token', username: 'new-username', githubId: 123, memberships, orgs });
		});

		it('should answer with the state of the token', async () => {
			const [ membershipsRes, orgsRes, userRes ] = await Promise.all([
				request(app).get('/github/user/memberships/orgs').set('x-github-authorization', 'Bearer user-token'),
				request(app).get('/github/user/123/orgs').set('x-github-authorization', 'Bearer user-token'),
				request(app).get('/github/user/123').set('x-github-authorization', 'Bearer user-token'),
			]);

			expect(membershipsRes.body).to.deep.equal(memberships);
			expect(orgsRes.body).to.deep.equal(orgs);
			expect(userRes.body).to.deep.equal({ login: 'new-username' });
		});

		it('should answer the self-check of an org by its numeric id too', async () => {
			const res = await request(app).get('/github/user/memberships/orgs/1').set('x-github-authorization', 'Bearer user-token');

			expect(res.body).to.deep.equal(memberships[0]);
		});

		it('should report a user nobody registered as gone', async () => {
			const res = await request(app).get('/github/user/999').set('x-github-authorization', 'Bearer user-token');

			expect(res.status).to.equal(404);
		});

		it('should answer 403 for the self-check of a restricted org', async () => {
			await request(app).post('/github/state').send({ token: 'restricted-token', username: 'u', memberships, restrictedOrgs: [ 'jsdelivr' ] });

			const res = await request(app).get('/github/user/memberships/orgs/jsdelivr').set('x-github-authorization', 'Bearer restricted-token');

			expect(res.status).to.equal(403);
		});

		it('should proxy a GitHub-issued token nothing was prepared for to GitHub itself', async () => {
			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer gho_real-token')
				.get('/user/memberships/orgs?per_page=100&page=1')
				.reply(200, [{ state: 'active', role: 'member', organization: { id: 9, login: 'real-org' } }]);

			const res = await request(app).get('/github/user/memberships/orgs?per_page=100&page=1').set('x-github-authorization', 'Bearer gho_real-token');

			expect(nock.isDone()).to.equal(true);
			expect(res.body).to.deep.equal([{ state: 'active', role: 'member', organization: { id: 9, login: 'real-org' } }]);
		});

		it('should answer a test token nothing was prepared for without calling GitHub', async () => {
			const [ membershipsRes, userRes ] = await Promise.all([
				request(app).get('/github/user/memberships/orgs').set('x-github-authorization', 'Bearer e2e-unknown-token'),
				request(app).get('/github/user/123').set('x-github-authorization', 'Bearer e2e-unknown-token'),
			]);

			expect(membershipsRes.status).to.equal(404);
			expect(userRes.body).to.deep.equal({ login: 'new-username' });
		});
	});

	describe('globalping', () => {
		it('should return the probe of a prepared ip and remember the code sent to it', async () => {
			await request(app).post('/globalping/state').send({ ip: '1.2.3.4' });

			const res = await request(app).post('/globalping/adoption-code').send({ ip: '1.2.3.4', code: '123456' });

			expect(res.status).to.equal(200);
			expect(res.body).to.include({ ip: '1.2.3.4', uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8' });

			const codeRes = await request(app).get('/globalping/adoption-code').query({ ip: '1.2.3.4' });
			expect(codeRes.body).to.deep.equal({ code: '123456' });

			// Reading it consumes it.
			const secondRes = await request(app).get('/globalping/adoption-code').query({ ip: '1.2.3.4' });
			expect(secondRes.body).to.deep.equal({ code: null });
		});

		it('should forget the unread code when the ip is prepared again', async () => {
			await request(app).post('/globalping/state').send({ ip: '1.2.3.5' });
			await request(app).post('/globalping/adoption-code').send({ ip: '1.2.3.5', code: '123456' });
			await request(app).post('/globalping/state').send({ ip: '1.2.3.5' });

			const res = await request(app).get('/globalping/adoption-code').query({ ip: '1.2.3.5' });
			expect(res.body).to.deep.equal({ code: null });
		});

		it('should proxy an ip nothing was prepared for to the API itself', async () => {
			nock(GLOBALPING_URL).post('/adoption-code', { ip: '9.9.9.9', code: '654321' }).reply(200, { ip: '9.9.9.9', city: 'Prague' });

			const res = await request(app).post('/globalping/adoption-code').send({ ip: '9.9.9.9', code: '654321' });

			expect(nock.isDone()).to.equal(true);
			expect(res.body).to.deep.equal({ ip: '9.9.9.9', city: 'Prague' });
		});
	});
});
