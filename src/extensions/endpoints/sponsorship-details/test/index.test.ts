import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import _ from 'lodash';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/sponsorship-details', () => {
	const readByQuery = sinon.stub();
	const whereStub = sinon.stub();
	const firstStub = sinon.stub();
	const rawStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'where') {
				return whereStub;
			} else if (property === 'first') {
				return firstStub;
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
		getSchema: () => ({}),
		database,
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return { readByQuery };
			}),
		},
		env: {
			CREDITS_BONUS_PER_100_DOLLARS: '10',
			MAX_CREDITS_BONUS: '1000',
		},
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());
	let accountability: { user: string; admin: boolean } | Record<string, never> | undefined = {};
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sinon.resetHistory();

		sandbox = sinon.createSandbox({
			useFakeTimers: {
				now: new Date('2025-07-15'),
				toFake: [ 'Date' ],
			},
		});

		readByQuery.resolves([]);
		whereStub.returns(database);
		firstStub.resolves({ id: 'account-id' });

		rawStub.callsFake((sql: string) => {
			if (sql.includes('gp_org_members')) {
				return Promise.resolve([ [{ id: 'account-id' }] ]);
			}

			if (sql.includes('github_id')) {
				return Promise.resolve([ [{ github_id: 'test-github-id' }] ]);
			}

			return Promise.resolve([ [] ]);
		});

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should return sponsorship details for valid user request', async () => {
		readByQuery.resolves([
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-08-04T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-09-03T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-11-02T01:00:00.000Z' },
			{ meta: { amountInDollars: 25, bonus: 0 }, date_created: '2024-12-02T01:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-12-02T01:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-01-01T01:00:00.000Z' },
			{ meta: { amountInDollars: 20, bonus: 0 }, date_created: '2025-01-31T01:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-01-31T01:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-03-02T01:00:00.000Z' },
			{ meta: { amountInDollars: 15, bonus: 0 }, date_created: '2025-04-01T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-04-01T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-05-01T02:00:00.000Z' },
			{ meta: { amountInDollars: 10, bonus: 5 }, date_created: '2025-05-31T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-05-31T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-06-30T02:00:00.000Z' },
			{ meta: { amountInDollars: 50, bonus: 5 }, date_created: '2025-07-10T02:00:00.000Z' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-07-10T02:00:00.000Z' },
		]);

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			bonus: 10,
			donatedInLastYear: 180,
			donatedByMonth: [ 5, 5, 0, 5, 30, 5, 25, 5, 20, 5, 15, 60 ],
		});

		expect(_.sum(res.body.donatedByMonth)).to.equal(180);
		expect(whereStub.args[0]?.[0]).to.deep.equal({ user: 'user-id' });
	});

	it('should distribute multi-month recurring credits across covered months and cap at the 12-month edge', async () => {
		readByQuery.resolves([
			// 5-month catch-up credit near the start of the window — 3 of the 5 covered months fall outside and are dropped.
			{ meta: { amountInDollars: 20, monthsCovered: 5, bonus: 0 }, date_created: '2024-08-20T02:00:00.000Z' },
			// 4-month catch-up credit awarded recently — fully inside the window.
			{ meta: { amountInDollars: 30, monthsCovered: 4, bonus: 0 }, date_created: '2025-07-10T02:00:00.000Z' },
		]);

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			bonus: 10,
			donatedInLastYear: 160,
			donatedByMonth: [ 20, 20, 0, 0, 0, 0, 0, 0, 30, 30, 30, 30 ],
		});

		expect(_.sum(res.body.donatedByMonth)).to.equal(160);
	});

	it('should return empty details for non-sponsor user', async () => {
		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			bonus: 0,
			donatedInLastYear: 0,
			donatedByMonth: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
		});

		expect(whereStub.args[0]?.[0]).to.deep.equal({ user: 'user-id' });
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

		expect(res.body).to.deep.equal({
			bonus: 0,
			donatedInLastYear: 0,
			donatedByMonth: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
		});

		expect(whereStub.args[0]?.[0]).to.deep.equal({ user: 'another-user-id' });
	});

	it('should reject request without accountability', async () => {
		accountability = undefined;

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"accountability" is required');
	});

	it('should reject request without an owner', async () => {
		const res = await request(app).get('/').query({});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"query" must contain at least one of [userId, accountId]');
	});

	it('should reject request with both userId and accountId', async () => {
		const res = await request(app).get('/').query({ userId: 'user-id', accountId: 'account-id' });

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"query" contains a conflict between exclusive peers [userId, accountId]');
	});

	it('should accept accountId of an org the user is a member of', async () => {
		const res = await request(app).get('/').query({ accountId: 'org-account-id' });

		expect(res.status).to.equal(200);
		expect(firstStub.callCount).to.equal(0);
		expect(rawStub.args[0]?.[1]).to.deep.include({ account: 'org-account-id', user: 'user-id' });
	});

	it('should reject accountId the user has no access to', async () => {
		rawStub.callsFake((sql: string) => Promise.resolve(sql.includes('gp_org_members') ? [ [] ] : [ [{ github_id: null }] ]));

		const res = await request(app).get('/').query({ accountId: 'org-account-id' });

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('You can not access this account.');
	});
});
