import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import nock from 'nock';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/admin-sponsors endpoint', () => {
	const stubs = {
		where: sinon.stub(),
		whereIn: sinon.stub(),
		whereRaw: sinon.stub(),
		orderByRaw: sinon.stub(),
		offset: sinon.stub(),
		limit: sinon.stub(),
		first: sinon.stub(),
		insert: sinon.stub(),
	};

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'then') {
				return (resolve: (value: unknown[]) => void) => resolve([]);
			}

			if (property in stubs) {
				return stubs[property as keyof typeof stubs];
			}

			return database;
		},
	}) as unknown as Knex;

	const endpointContext = {
		database,
		env: { GITHUB_ACCESS_TOKEN: 'token' },
		logger: { error: console.error },
	} as unknown as EndpointExtensionContext;

	const app = express();
	let accountability: { user: string; admin: boolean } | undefined;

	app.use(express.json());

	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	before(() => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
	});

	beforeEach(() => {
		sinon.resetHistory();
		Object.values(stubs).forEach(stub => stub.returns(database));
		stubs.first.resolves({});
		stubs.limit.resolves([]);
		stubs.insert.resolves();
		nock('https://api.github.com').get('/user/6191378').reply(200, { login: 'jsDelivr' });
		accountability = { user: 'admin-id', admin: true };
	});

	afterEach(() => {
		nock.cleanAll();
	});

	after(() => {
		nock.enableNetConnect();
	});

	it('forbids a request without accountability', async () => {
		accountability = undefined;
		const response = await request(app).get('/summary');

		expect(response.status).to.equal(403);
		expect(response.text).to.equal('Forbidden');
	});

	it('forbids a non-admin request', async () => {
		accountability = { user: 'user-id', admin: false };
		const response = await request(app).get('/summary');

		expect(response.status).to.equal(403);
		expect(response.text).to.equal('Forbidden');
	});

	it('returns summary data to an admin for a valid calendar year', async () => {
		const response = await request(app).get('/summary').query({ period: '2025' });

		expect(response.status).to.equal(200);

		expect(response.body.chart.map((point: { month: string }) => point.month)).to.deep.equal([
			'2025-01',
			'2025-02',
			'2025-03',
			'2025-04',
			'2025-05',
			'2025-06',
			'2025-07',
			'2025-08',
			'2025-09',
			'2025-10',
			'2025-11',
			'2025-12',
		]);

		expect(stubs.where.calledWith('additions.date_created', '>=', new Date('2025-01-01T00:00:00.000Z'))).to.equal(true);
		expect(stubs.where.calledWith('additions.date_created', '<', new Date('2026-01-01T00:00:00.000Z'))).to.equal(true);
	});

	it('applies event pagination defaults and parses event filters and sorting', async () => {
		const response = await request(app).get('/events').query({
			period: '2025',
			types: 'recurring_sponsorship,tier_changed',
			sort: 'sponsorshipValue',
			direction: 'asc',
		});

		expect(response.status).to.equal(200);
		expect(response.body).to.deep.equal({ items: [], total: 0 });
		expect(stubs.whereIn.calledWith('additions.reason', [ 'recurring_sponsorship', 'tier_changed' ])).to.equal(true);
		expect(stubs.orderByRaw.firstCall.args[0]).to.include('amountInDollars').and.to.match(/ asc$/);
		expect(stubs.offset.calledWith(0)).to.equal(true);
		expect(stubs.limit.calledWith(10)).to.equal(true);
	});

	it('rejects invalid event pagination, filters, and sorting', async () => {
		const invalidLimit = await request(app).get('/events').query({ limit: 101 });
		const invalidType = await request(app).get('/events').query({ types: 'recurring_sponsorship,other' });
		const invalidSort = await request(app).get('/events').query({ sort: 'creditsIssued' });
		const invalidDirection = await request(app).get('/events').query({ direction: 'sideways' });

		expect(invalidLimit.status).to.equal(400);
		expect(invalidType.status).to.equal(400);
		expect(invalidSort.status).to.equal(400);
		expect(invalidDirection.status).to.equal(400);
		expect(stubs.limit.called).to.equal(false);
	});

	it('parses account filters', async () => {
		const response = await request(app).get('/accounts').query({
			period: '2025',
			offset: 10,
			limit: 20,
			search: 'example',
			statuses: 'active,former',
			linked: 'true',
			sort: 'status',
			direction: 'desc',
		});

		expect(response.status).to.equal(200);
		expect(stubs.whereRaw.calledWith('((current_sponsors.github_id IS NOT NULL OR legacy_sponsors.github_id IS NOT NULL) OR (NOT (current_sponsors.github_id IS NOT NULL OR legacy_sponsors.github_id IS NOT NULL) AND history.has_recurring = 1))')).to.equal(true);
		expect(stubs.whereRaw.calledWith('directus_users.id IS NOT NULL')).to.equal(true);
		expect(stubs.orderByRaw.firstCall.args[0]).to.include('CASE').and.to.match(/ desc$/);
		expect(stubs.offset.calledWith(10)).to.equal(true);
		expect(stubs.limit.calledWith(20)).to.equal(true);
	});

	it('rejects invalid account filters and sorting', async () => {
		const invalidStatus = await request(app).get('/accounts').query({ statuses: 'active,unknown' });
		const invalidLinked = await request(app).get('/accounts').query({ linked: 'sometimes' });
		const invalidSort = await request(app).get('/accounts').query({ sort: 'periodCredits' });
		const invalidDirection = await request(app).get('/accounts').query({ direction: 'up' });

		expect(invalidStatus.status).to.equal(400);
		expect(invalidLinked.status).to.equal(400);
		expect(invalidSort.status).to.equal(400);
		expect(invalidDirection.status).to.equal(400);
		expect(stubs.limit.called).to.equal(false);
	});

	it('applies manual-addition pagination defaults and parses filters and sorting', async () => {
		const response = await request(app).get('/manual-additions').query({
			search: 'example',
			types: 'payment,other',
			sort: 'credits',
			direction: 'asc',
		});

		expect(response.status).to.equal(200);
		expect(stubs.orderByRaw.calledWith('additions.amount asc')).to.equal(true);
		expect(stubs.offset.calledWith(0)).to.equal(true);
		expect(stubs.limit.calledWith(10)).to.equal(true);
	});

	it('creates a manual addition attributed to the authenticated administrator', async () => {
		const body = {
			type: 'payment',
			githubId: '6191378',
			credits: 10_000,
			amountInDollars: 5,
		};

		const response = await request(app).post('/manual-additions').send(body);

		expect(response.status).to.equal(201);
		expect(nock.isDone()).to.equal(true);

		expect(stubs.insert.firstCall.args[0]).to.deep.include({
			github_id: '6191378',
			amount: 10_000,
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ amountInDollars: 5, githubLogin: 'jsDelivr', manual: true }),
			user_updated: 'admin-id',
		});

		expect(stubs.insert.firstCall.args[0].date_created).to.be.instanceOf(Date);
	});

	it('creates other credits with the user-visible comment', async () => {
		const response = await request(app).post('/manual-additions').send({
			type: 'other',
			githubId: '6191378',
			credits: 10_000,
			comment: 'Customer support adjustment.',
		});

		expect(response.status).to.equal(201);

		expect(stubs.insert.firstCall.args[0]).to.deep.include({
			github_id: '6191378',
			amount: 10_000,
			reason: 'other',
			meta: JSON.stringify({ comment: 'Customer support adjustment.', githubLogin: 'jsDelivr', manual: true }),
			user_updated: 'admin-id',
		});
	});

	it('rejects a manual addition for an unknown GitHub account', async () => {
		nock.cleanAll();
		nock('https://api.github.com').get('/user/6191378').reply(404);

		const response = await request(app).post('/manual-additions').send({
			type: 'other',
			githubId: '6191378',
			credits: 10_000,
			comment: 'Customer support adjustment.',
		});

		expect(response.status).to.equal(400);
		expect(response.text).to.equal('GitHub account not found.');
		expect(stubs.insert.called).to.equal(false);
	});

	it('rejects an invalid manual-addition comment', async () => {
		const response = await request(app).post('/manual-additions').send({
			type: 'other',
			githubId: '6191378',
			credits: 10_000,
			comment: 'customer support adjustment',
		});

		expect(response.status).to.equal(400);
		expect(stubs.insert.called).to.equal(false);
	});

	it('rejects invalid manual-addition filters and sorting', async () => {
		const invalidType = await request(app).get('/manual-additions').query({ types: 'payment,recurring' });
		const invalidSort = await request(app).get('/manual-additions').query({ sort: 'amountInDollars' });
		const invalidDirection = await request(app).get('/manual-additions').query({ direction: 'up' });

		expect(invalidType.status).to.equal(400);
		expect(invalidSort.status).to.equal(400);
		expect(invalidDirection.status).to.equal(400);
		expect(stubs.limit.called).to.equal(false);
	});
});
