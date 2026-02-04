import { type EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction, type Response } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('local-adoption endpoint', () => {
	const sandbox = sinon.createSandbox();

	const dbStub = {
		where: sandbox.stub(),
		whereNull: sandbox.stub(),
		whereNotNull: sandbox.stub(),
		select: sandbox.stub(),
		orWhereRaw: sandbox.stub(),
		whereRaw: sandbox.stub(),
		first: sandbox.stub(),
		then: sandbox.stub(),
	};

	// make the dbStub chainable
	dbStub.where.returns(dbStub);
	dbStub.whereNull.returns(dbStub);
	dbStub.whereNotNull.returns(dbStub);
	dbStub.select.returns(dbStub);
	dbStub.orWhereRaw.returns(dbStub);
	dbStub.whereRaw.returns(dbStub);

	const updateOne = sandbox.stub();
	const readOne = sandbox.stub();
	const getSchema = sandbox.stub().resolves({});

	const endpointContext = {
		logger: {
			error: console.error,
		},
		database: () => dbStub,
		getSchema,
		services: {
			ItemsService: sandbox.stub().callsFake(() => {
				return { updateOne, readOne };
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

	app.use(((req: any, _res: Response, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	const clientIp = '192.168.1.10';
	const probeData = {
		id: 'probe-1',
		country: 'US',
		city: 'New York',
		network: 'Local LAN',
		ip: clientIp,
		altIps: JSON.stringify([]),
		localAdoptionServer: JSON.stringify({
			token: 'valid-token-123',
			ips: [ '192.168.1.50', '192.168.1.51' ],
		}),
		status: 'ready',
	};

	beforeEach(() => {
		sandbox.resetHistory();
		simulateIpFailure = false;

		dbStub.first.resolves(probeData);
		dbStub.then.yields([ probeData ]);

		updateOne.resolves('probe-1');
		readOne.resolves({ ...probeData, userId: 'user-id' });

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

			expect(res.body).to.deep.equal([ '192.168.1.50', '192.168.1.51' ]);

			expect(dbStub.whereNull.calledWith('userId')).to.equal(true);
			expect(dbStub.whereNotNull.calledWith('localAdoptionServer')).to.equal(true);
			expect(dbStub.where.calledWith('status', 'ready')).to.equal(true);
		});

		it('should return empty array if no probes match', async () => {
			dbStub.then.yields([]);

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

	describe('GET /:token', () => {
		it('should return probe details if token matches', async () => {
			const res = await request(app)
				.get('/valid-token-123')
				.set('X-Forwarded-For', clientIp);

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal(probeData);

			expect(dbStub.select.calledWith('country', 'city', 'network', 'ip')).to.equal(true);
			expect(dbStub.first.called).to.equal(true);

			expect(dbStub.whereRaw.calledWith(
				'JSON_VALUE(localAdoptionServer, "$.token") = ?',
				[ 'valid-token-123' ],
			)).to.equal(true);
		});

		it('should 404 if probe not found', async () => {
			dbStub.first.resolves(undefined);

			const res = await request(app)
				.get('/invalid-token')
				.set('X-Forwarded-For', clientIp);

			expect(res.status).to.equal(404);
			expect(res.text).to.equal('Probe not found or not available for adoption.');
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

			expect(dbStub.first.called).to.equal(true);
			expect(updateOne.calledWith('probe-1', { userId: 'user-id' }, { emitEvents: false })).to.equal(true);
			expect(readOne.calledWith('probe-1')).to.equal(true);
		});

		it('should 404 if probe not found via token', async () => {
			dbStub.first.resolves(undefined);

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
