import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/credits-timeline endpoint', () => {
	const firstStub = sinon.stub();
	const offsetStub = sinon.stub();
	const rawStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'first') {
				return firstStub;
			} else if (property === 'offset') {
				return offsetStub;
			} else if (property === 'raw') {
				return rawStub;
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
		firstStub.resolves({ count: 0 });
		offsetStub.resolves([]);
		// getRequestAccountId, then getAccountGithubId.
		rawStub.onFirstCall().resolves([ [{ id: 'account-id' }] ]);
		rawStub.onSecondCall().resolves([ [{ github_id: 'github-id' }] ]);
		rawStub.resolves([ [] ]);

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	it('should accept user request', async () => {
		firstStub.resolves({ count: 1 });

		offsetStub.resolves([{
			type: 'addition',
			date_created: '2025-04-10 02:00:00',
			amount: 2000,
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ amountInDollars: 1, bonus: 0 }),
			adopted_probe: null,
		}]);

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			changes: [
				{
					type: 'addition',
					date_created: '2025-04-10 02:00:00',
					amount: 2000,
					reason: 'one_time_sponsorship',
					meta: { amountInDollars: 1, bonus: 0 },
					adopted_probe: null,
				},
			],
			count: 1,
		});
	});

	it('should reject user request for another user', async () => {
		const res = await request(app).get('/').query({
			userId: 'another-user-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Allowed only for the current user or admin.');
	});

	it('should accept admin request for another user', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			userId: 'another-user-id',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ changes: [], count: 0 });
	});

	it('should accept admin request for all users', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			userId: 'all',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ changes: [], count: 0 });
	});

	it('should reject user request for all users', async () => {
		const res = await request(app).get('/').query({
			userId: 'all',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Allowed only for admin.');
	});

	it('should accept a request with accountId', async () => {
		const res = await request(app).get('/').query({ accountId: 'account-id' });

		expect(res.status).to.equal(200);
	});

	it('should reject a request for an account the user has no access to', async () => {
		rawStub.onFirstCall().resolves([ [] ]);

		const res = await request(app).get('/').query({ accountId: 'foreign-account-id' });

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});

	it('should reject a request with both userId and accountId', async () => {
		const res = await request(app).get('/').query({ userId: 'user-id', accountId: 'account-id' });

		expect(res.status).to.equal(400);
		expect(res.text).to.include('contains a conflict');
	});

	it('should accept admin request for all accounts', async () => {
		accountability = { user: 'admin-id', admin: true };

		const res = await request(app).get('/').query({ accountId: 'all' });

		expect(res.status).to.equal(200);
	});

	it('should reject user request for all accounts', async () => {
		const res = await request(app).get('/').query({ accountId: 'all' });

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});
});
