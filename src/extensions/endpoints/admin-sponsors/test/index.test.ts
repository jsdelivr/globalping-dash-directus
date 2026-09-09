import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import { createAdminSponsorsEndpoint } from '../src/index.js';

describe('/admin-sponsors endpoint', () => {
	const summary = {
		overview: {
			activeSponsors: 2,
			previousMonth: { totalValue: 30, recurringValue: 20, oneTimeValue: 10 },
			estimatedNextMonthValue: 25,
		},
		period: { sponsors: 2, sponsorshipValue: 30 },
		allTime: { sponsors: 3 },
		chart: [],
	};
	const queryService = {
		getSummary: sinon.stub().resolves(summary),
		getEvents: sinon.stub().resolves({ items: [], total: 0 }),
		getAccounts: sinon.stub().resolves({ items: [], total: 0 }),
		getManualAdditions: sinon.stub().resolves({ items: [], total: 0 }),
	};
	const insert = sinon.stub().resolves();
	const databaseStub = sinon.stub().returns({ insert });
	const database = databaseStub as unknown as EndpointExtensionContext['database'];
	const githubLoginResolver = sinon.stub().resolves('jsDelivr');
	const endpointContext = {
		database,
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
	createAdminSponsorsEndpoint(queryService, githubLoginResolver)(router, endpointContext);
	app.use(router);

	beforeEach(() => {
		sinon.resetHistory();
		insert.resolves();
		accountability = { user: 'admin-id', admin: true };
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
		expect(response.body).to.deep.equal(summary);
		expect(queryService.getSummary.firstCall.args[0]).to.equal(database);

		expect(queryService.getSummary.firstCall.args[1]).to.deep.equal({
			from: new Date('2025-01-01T00:00:00.000Z'),
			to: new Date('2026-01-01T00:00:00.000Z'),
			monthKeys: [
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
			],
		});
	});

	it('applies event pagination defaults and parses event filters and sorting', async () => {
		const response = await request(app).get('/events').query({
			period: '2025',
			types: 'recurring_sponsorship,tier_changed',
			sort: 'sponsorshipValue',
			direction: 'asc',
		});

		expect(response.status).to.equal(200);

		expect(queryService.getEvents.firstCall.args[2]).to.deep.equal({
			period: '2025',
			offset: 0,
			limit: 10,
			types: [ 'recurring_sponsorship', 'tier_changed' ],
			sort: 'sponsorshipValue',
			direction: 'asc',
		});
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
		expect(queryService.getEvents.called).to.equal(false);
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

		expect(queryService.getAccounts.firstCall.args[2]).to.deep.equal({
			period: '2025',
			offset: 10,
			limit: 20,
			search: 'example',
			statuses: [ 'active', 'former' ],
			linked: true,
			sort: 'status',
			direction: 'desc',
		});
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
		expect(queryService.getAccounts.called).to.equal(false);
	});

	it('applies manual-addition pagination defaults and parses filters and sorting', async () => {
		const response = await request(app).get('/manual-additions').query({
			search: 'example',
			types: 'payment,other',
			sort: 'credits',
			direction: 'asc',
		});

		expect(response.status).to.equal(200);

		expect(queryService.getManualAdditions.firstCall.args[1]).to.deep.equal({
			offset: 0,
			limit: 10,
			search: 'example',
			types: [ 'payment', 'other' ],
			sort: 'credits',
			direction: 'asc',
		});
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
		expect(databaseStub.calledOnceWithExactly('gp_credits_additions')).to.equal(true);
		expect(githubLoginResolver.calledOnceWithExactly('6191378', endpointContext)).to.equal(true);

		expect(insert.firstCall.args[0]).to.deep.include({
			github_id: '6191378',
			amount: 10_000,
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ amountInDollars: 5, githubLogin: 'jsDelivr', manual: true }),
			user_updated: 'admin-id',
		});

		expect(insert.firstCall.args[0].date_created).to.be.instanceOf(Date);
	});

	it('creates other credits with the user-visible comment', async () => {
		const response = await request(app).post('/manual-additions').send({
			type: 'other',
			githubId: '6191378',
			credits: 10_000,
			comment: 'Customer support adjustment.',
		});

		expect(response.status).to.equal(201);

		expect(insert.firstCall.args[0]).to.deep.include({
			github_id: '6191378',
			amount: 10_000,
			reason: 'other',
			meta: JSON.stringify({ comment: 'Customer support adjustment.', githubLogin: 'jsDelivr', manual: true }),
			user_updated: 'admin-id',
		});
	});

	it('rejects an invalid manual-addition comment', async () => {
		const response = await request(app).post('/manual-additions').send({
			type: 'other',
			githubId: '6191378',
			credits: 10_000,
			comment: 'customer support adjustment',
		});

		expect(response.status).to.equal(400);
		expect(insert.called).to.equal(false);
	});

	it('rejects invalid manual-addition filters and sorting', async () => {
		const invalidType = await request(app).get('/manual-additions').query({ types: 'payment,recurring' });
		const invalidSort = await request(app).get('/manual-additions').query({ sort: 'amountInDollars' });
		const invalidDirection = await request(app).get('/manual-additions').query({ direction: 'up' });

		expect(invalidType.status).to.equal(400);
		expect(invalidSort.status).to.equal(400);
		expect(invalidDirection.status).to.equal(400);
		expect(queryService.getManualAdditions.called).to.equal(false);
	});
});
