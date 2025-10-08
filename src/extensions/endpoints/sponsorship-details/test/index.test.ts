import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import _ from 'lodash';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/sponsorship-details', () => {
	const readOne = sinon.stub();
	const readByQuery = sinon.stub();
	const endpointContext = {
		logger: {
			error: console.error,
		},
		getSchema: () => ({}),
		database: () => ({}),
		services: {
			UsersService: sinon.stub().callsFake(() => {
				return { readOne };
			}),
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

		readOne.resolves({
			external_identifier: 'test-github-id',
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
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-08-04 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-09-03 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-11-02 01:00:00' },
			{ meta: { amountInDollars: 25, bonus: 0 }, date_created: '2024-12-02 01:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2024-12-02 01:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-01-01 01:00:00' },
			{ meta: { amountInDollars: 20, bonus: 0 }, date_created: '2025-01-31 01:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-01-31 01:00:00' },
			{ meta: { amountInDollars: 5, bonus: 0 }, date_created: '2025-03-02 01:00:00' },
			{ meta: { amountInDollars: 15, bonus: 0 }, date_created: '2025-04-01 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-04-01 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-05-01 02:00:00' },
			{ meta: { amountInDollars: 10, bonus: 5 }, date_created: '2025-05-31 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-05-31 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-06-30 02:00:00' },
			{ meta: { amountInDollars: 50, bonus: 5 }, date_created: '2025-07-10 02:00:00' },
			{ meta: { amountInDollars: 5, bonus: 5 }, date_created: '2025-07-10 02:00:00' },
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
		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('user-id');
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

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('user-id');
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

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('another-user-id');
	});

	it('should reject request without accountability', async () => {
		accountability = undefined;

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"accountability" is required');
	});

	it('should reject request without userId', async () => {
		const res = await request(app).get('/').query({});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"query.userId" is required');
	});
});
