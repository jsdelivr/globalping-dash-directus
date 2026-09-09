import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express from 'express';
import nock from 'nock';
import request from 'supertest';
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
			await request(app).post('/github/state').send({ token: 'user-token', username: 'new-username', memberships, orgs });
		});

		it('should answer with the state of the token', async () => {
			const [ membershipsRes, orgsRes, userRes ] = await Promise.all([
				request(app).get('/github/user/memberships/orgs').set('Authorization', 'Bearer user-token'),
				request(app).get('/github/user/123/orgs').set('Authorization', 'Bearer user-token'),
				request(app).get('/github/user/123').set('Authorization', 'Bearer user-token'),
			]);

			expect(membershipsRes.body).to.deep.equal(memberships);
			expect(orgsRes.body).to.deep.equal(orgs);
			expect(userRes.body).to.deep.equal({ login: 'new-username' });
		});

		it('should proxy a token nothing was prepared for to GitHub itself', async () => {
			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer real-token')
				.get('/user/memberships/orgs?per_page=100&page=1')
				.reply(200, [{ state: 'active', role: 'member', organization: { id: 9, login: 'real-org' } }]);

			const res = await request(app).get('/github/user/memberships/orgs?per_page=100&page=1').set('Authorization', 'Bearer real-token');

			expect(nock.isDone()).to.equal(true);
			expect(res.body).to.deep.equal([{ state: 'active', role: 'member', organization: { id: 9, login: 'real-org' } }]);
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

		it('should proxy an ip nothing was prepared for to the API itself', async () => {
			nock(GLOBALPING_URL).post('/adoption-code', { ip: '9.9.9.9', code: '654321' }).reply(200, { ip: '9.9.9.9', city: 'Prague' });

			const res = await request(app).post('/globalping/adoption-code').send({ ip: '9.9.9.9', code: '654321' });

			expect(nock.isDone()).to.equal(true);
			expect(res.body).to.deep.equal({ ip: '9.9.9.9', city: 'Prague' });
		});
	});
});
