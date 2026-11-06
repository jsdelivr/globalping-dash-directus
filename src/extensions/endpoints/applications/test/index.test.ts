import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/applications endpoint', () => {
	const countStub = sinon.stub();
	const offsetStub = sinon.stub();
	const rawStub = sinon.stub();
	const delStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'count') {
				return countStub;
			} else if (property === 'offset') {
				return offsetStub;
			} else if (property === 'raw') {
				return rawStub;
			} else if (property === 'del') {
				return delStub;
			}

			return database;
		},
	}) as unknown as Knex;

	const endpointContext = {
		logger: {
			error: console.error,
		},
		database,
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());
	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	beforeEach(() => {
		sinon.resetHistory();
		countStub.resolves([{ total: 0 }]);
		offsetStub.resolves([]);
		rawStub.resolves([ [{ role: 'admin' }] ]);
		delStub.resolves(1);

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	it('should accept user request', async () => {
		offsetStub.resolves([{
			id: '1',
			app_id: 'app-1',
			date_last_used: '2025-04-10 02:00:00',
			user_created: 'user-1',
			app_name: 'Client Credentials App',
			owner_name: null,
			owner_url: null,
		}]);

		countStub.resolves([{ total: 1 }]);

		const res = await request(app).get('/').query({
			accountId: 'account-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			applications: [
				{
					id: 'app-1',
					name: 'Client Credentials App',
					date_last_used: '2025-04-10 02:00:00',
					owner_name: 'Globalping',
					owner_url: 'https://globalping.io/',
					user_created: 'user-1',
				},
			],
			total: 1,
		});
	});

	it('should reject a request for an account the user has no access to', async () => {
		rawStub.resolves([ [] ]);

		const res = await request(app).get('/').query({
			accountId: 'foreign-account-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});

	it('should accept admin request for another account', async () => {
		rawStub.resolves([ [] ]);

		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			accountId: 'foreign-account-id',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ applications: [], total: 0 });
	});

	it('should reject a request without accountId', async () => {
		const res = await request(app).get('/').query({});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"query.accountId" is required');
	});

	it('should accept admin request for all accounts', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			accountId: 'all',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ applications: [], total: 0 });
	});

	it('should reject user request for all accounts', async () => {
		const res = await request(app).get('/').query({
			accountId: 'all',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});

	it('should reject a revoke for all accounts', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).post('/revoke').send({
			accountId: 'all',
			id: 'app-1',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('An application can only be revoked for a single account.');
	});

	it('should accept a revoke of an own application', async () => {
		const res = await request(app).post('/revoke').send({
			accountId: 'account-id',
			id: 'app-1',
		});

		expect(res.status).to.equal(200);
		expect(res.text).to.equal('Application access revoked.');
	});

	it('should reject a revoke for an account the user has no access to', async () => {
		rawStub.resolves([ [] ]);

		const res = await request(app).post('/revoke').send({
			accountId: 'foreign-account-id',
			id: 'app-1',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});

	it('should reject a revoke without accountId', async () => {
		const res = await request(app).post('/revoke').send({
			id: 'app-1',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"body.accountId" is required');
	});

	it('should reject a revoke of an application created by somebody else', async () => {
		const res = await request(app).post('/revoke').send({
			accountId: 'account-id',
			userCreated: 'another-user-id',
			id: 'app-1',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can only revoke your own applications.');
	});
});
