import { type EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction, type Response } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('local-adoption endpoint', () => {
	const sandbox = sinon.createSandbox();

	const knexQueryBuilder = {
		where: sandbox.stub(),
		orWhere: sandbox.stub(),
		whereNull: sandbox.stub(),
		whereNotNull: sandbox.stub(),
		select: sandbox.stub(),
		orWhereRaw: sandbox.stub(),
		whereRaw: sandbox.stub(),
		first: sandbox.stub(),
		then: sandbox.stub(),
		transacting: sandbox.stub(),
		forUpdate: sandbox.stub(),
	};

	// make the knexQueryBuilder chainable
	knexQueryBuilder.where.returns(knexQueryBuilder);
	knexQueryBuilder.orWhere.returns(knexQueryBuilder);
	knexQueryBuilder.whereNull.returns(knexQueryBuilder);
	knexQueryBuilder.whereNotNull.returns(knexQueryBuilder);
	knexQueryBuilder.select.returns(knexQueryBuilder);
	knexQueryBuilder.orWhereRaw.returns(knexQueryBuilder);
	knexQueryBuilder.whereRaw.returns(knexQueryBuilder);
	knexQueryBuilder.transacting.returns(knexQueryBuilder);
	knexQueryBuilder.forUpdate.returns(knexQueryBuilder);

	const databaseStub = sandbox.stub().returns(knexQueryBuilder);

	(databaseStub as any).transaction = sandbox.stub().callsFake(async (callback: any) => {
		return callback(knexQueryBuilder);
	});

	const updateOne = sandbox.stub();
	const readOne = sandbox.stub();
	const readByQuery = sandbox.stub();
	const notificationCreateOne = sandbox.stub();
	const getSchema = sandbox.stub().resolves({});

	const endpointContext = {
		logger: {
			error: console.error,
		},
		database: databaseStub,
		getSchema,
		services: {
			ItemsService: sandbox.stub().callsFake(() => {
				return { updateOne, readOne, readByQuery };
			}),
			NotificationsService: sandbox.stub().callsFake(() => {
				return { createOne: notificationCreateOne };
			}),
		},
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());

	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	let simulateIpFailure = false;

	// middleware to simulate context (Accountability) and failure scenarios (IP)
	app.use(((req: any, _res: Response, next: NextFunction) => {
		if (simulateIpFailure) {
			delete req.headers['x-forwarded-for'];

			Object.defineProperty(req, 'socket', { get: () => ({}), configurable: true });
			Object.defineProperty(req, 'connection', { get: () => ({}), configurable: true });
			Object.defineProperty(req, 'ip', { get: () => undefined, configurable: true });
		}

		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	const clientIp = '192.168.1.10';

	const reducedProbeData = {
		country: 'US',
		city: 'New York',
		network: 'Local LAN',
		localAdoptionServer: JSON.stringify({
			token: 'valid-token-123',
			ips: [ '192.168.1.50', '192.168.1.51' ],
		}),
	};

	const probeData = {
		id: 'probe-1',
		ip: clientIp,
		altIps: JSON.stringify([]),
		status: 'ready',
		...reducedProbeData,
	};

	beforeEach(() => {
		sandbox.resetHistory();
		simulateIpFailure = false;

		knexQueryBuilder.first.resolves(probeData);
		knexQueryBuilder.then.yields([{ ...reducedProbeData, publicIp: clientIp }]);

		updateOne.resolves('probe-1');
		readOne.resolves({ ...probeData, userId: 'user-id' });
		readByQuery.resolves([]);
		notificationCreateOne.resolves('notification-1');

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	after(() => {
		sandbox.restore();
	});

	describe('GET /', () => {
		it('should return IPs available for local adoption', async () => {
			const res = await request(app)
				.get('/')
				.set('X-Forwarded-For', clientIp);

			expect(res.status).to.equal(200);
			expect(res.header['cache-control']).to.equal('no-store, private');

			expect(res.body).to.deep.equal([
				{
					country: 'US',
					city: 'New York',
					network: 'Local LAN',
					publicIp: clientIp,
					localIps: [ '192.168.1.50', '192.168.1.51' ],
				},
			]);

			expect(knexQueryBuilder.whereNull.calledWith('userId')).to.equal(true);
			expect(knexQueryBuilder.whereNotNull.calledWith('localAdoptionServer')).to.equal(true);
			expect(knexQueryBuilder.where.calledWith('status', 'ready')).to.equal(true);
		});

		it('should return empty array if no probes match', async () => {
			knexQueryBuilder.then.yields([]);

			const res = await request(app)
				.get('/')
				.set('X-Forwarded-For', clientIp);

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal([]);
		});

		it('should 400 if client IP cannot be determined', async () => {
			simulateIpFailure = true;

			const res = await request(app).get('/');

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('Client IP could not be determined.');
		});
	});

	describe('POST /adopt', () => {
		it('should adopt probe successfully', async () => {
			const res = await request(app)
				.post('/adopt')
				.set('X-Forwarded-For', clientIp)
				.send({
					token: 'valid-token-123',
				});

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.include({ id: 'probe-1', userId: 'user-id' });

			expect(knexQueryBuilder.first.called).to.equal(true);
			expect(updateOne.called).to.equal(true);
			expect(readOne.calledWith('probe-1')).to.equal(true);
		});

		it('should 404 if probe not found via token', async () => {
			knexQueryBuilder.first.resolves(undefined);

			const res = await request(app)
				.post('/adopt')
				.set('X-Forwarded-For', clientIp)
				.send({
					token: 'invalid-token',
				});

			expect(res.status).to.equal(404);
			expect(res.text).to.equal('No probe with a matching token found.');
			expect(updateOne.called).to.equal(false);
		});

		it('should 400 if token is missing', async () => {
			const res = await request(app)
				.post('/adopt')
				.set('X-Forwarded-For', clientIp)
				.send({});

			expect(res.status).to.equal(400);
			expect(res.text).to.include('"body.token" is required');
		});

		it('should 400 if accountability.user is missing', async () => {
			accountability = {};

			const res = await request(app)
				.post('/adopt')
				.set('X-Forwarded-For', clientIp)
				.send({
					token: 'valid-token-123',
				});

			expect(res.status).to.equal(400);
			expect(res.text).to.include('"accountability.user" is required');
		});
	});
});
