import { type EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction, type Response } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('local-adoption endpoint', () => {
	const sandbox = sinon.createSandbox();

	let knexQueryBuilder: any;
	let databaseStub: any;
	let updateOne: any;
	let readOne: any;
	let readByQuery: any;
	let notificationCreateOne: any;
	let getSchema: any;
	let endpointContext: EndpointExtensionContext;
	let app: express.Express;
	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	let simulateIpFailure = false;

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
		uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
		status: 'ready',
		isIPv4Supported: true,
		isIPv6Supported: false,
		version: '0.27.0',
		nodeVersion: 'v22.17.0',
		hardwareDevice: 'v2',
		hardwareDeviceFirmware: 'v2.1',
		asn: 12876,
		...reducedProbeData,
	};

	beforeEach(() => {
		sandbox.restore();
		simulateIpFailure = false;

		knexQueryBuilder = {
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

		knexQueryBuilder.where.returns(knexQueryBuilder);
		knexQueryBuilder.orWhere.returns(knexQueryBuilder);
		knexQueryBuilder.whereNull.returns(knexQueryBuilder);
		knexQueryBuilder.whereNotNull.returns(knexQueryBuilder);
		knexQueryBuilder.select.returns(knexQueryBuilder);
		knexQueryBuilder.orWhereRaw.returns(knexQueryBuilder);
		knexQueryBuilder.whereRaw.returns(knexQueryBuilder);
		knexQueryBuilder.transacting.returns(knexQueryBuilder);
		knexQueryBuilder.forUpdate.returns(knexQueryBuilder);

		databaseStub = sandbox.stub().returns(knexQueryBuilder);
		databaseStub.transaction = sandbox.stub().callsFake(async (callback: any) => callback(knexQueryBuilder));

		updateOne = sandbox.stub();
		readOne = sandbox.stub();
		readByQuery = sandbox.stub();
		notificationCreateOne = sandbox.stub();
		getSchema = sandbox.stub().resolves({});

		endpointContext = {
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

		app = express();
		app.use(express.json());

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

			expect(updateOne.args[0]?.[1]).to.deep.include({
				name: 'probe-us-new-york-01',
				userId: 'user-id',
				ip: clientIp,
			});

			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'user-id',
				subject: 'New probe probe-us-new-york-01 adopted',
				message: 'A new probe [**probe-us-new-york-01**](/probes/probe-1) with IP address **192.168.1.10** has been assigned to your account.',
			});

			expect(readOne.calledWith('probe-1')).to.equal(true);
		});

		it('should only update metadata when probe is already assigned to user', async () => {
			knexQueryBuilder.first.onFirstCall().resolves(probeData);

			knexQueryBuilder.first.onSecondCall().resolves({
				...probeData,
				userId: 'user-id',
			});

			const res = await request(app)
				.post('/adopt')
				.set('X-Forwarded-For', clientIp)
				.send({
					token: 'valid-token-123',
				});

			expect(res.status).to.equal(200);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]?.[0]).to.equal('probe-1');

			expect(updateOne.args[0]?.[1]).to.deep.include({
				ip: '192.168.1.10',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				systemTags: [],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				asn: 12876,
				network: 'Local LAN',
				localAdoptionServer: reducedProbeData.localAdoptionServer,
			});

			expect(updateOne.args[0]?.[1]?.lastSyncDate).to.be.instanceOf(Date);
			expect(updateOne.args[0]?.[2]).to.deep.equal({ emitEvents: false });

			expect(notificationCreateOne.callCount).to.equal(0);
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
