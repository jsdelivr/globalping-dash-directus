import { type EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction, type Response } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint, { type AdoptedProbe, type ProbeToAdopt, type Row, type Request } from '../src/index.js';

describe('adoption code endpoints', () => {
	const sandbox = sinon.createSandbox({ useFakeTimers: true });
	const createOne = sinon.stub();
	const updateOne = sinon.stub();
	const readByQuery = sinon.stub();
	const readOne = sinon.stub();
	const notificationCreateOne = sinon.stub();
	const sql = {
		where: sinon.stub(),
		whereRaw: sinon.stub(),
		orWhere: sinon.stub(),
		orWhereRaw: sinon.stub(),
		orderByRaw: sinon.stub(),
		first: sinon.stub(),
	};
	sql.where.returns(sql);
	sql.whereRaw.returns(sql);
	sql.orWhere.returns(sql);
	sql.orWhereRaw.returns(sql);
	sql.orderByRaw.returns(sql);
	const endpointContext = {
		logger: {
			error: console.error,
		},
		getSchema: () => {},
		database: () => sql,
		env: {
			GLOBALPING_URL: 'https://api.globalping.io/v1',
			GP_SYSTEM_KEY: 'system',
			TARGET_HW_DEVICE_FIRMWARE: 'v2.0',
			TARGET_NODE_VERSION: 'v22.16.0',
		},
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return { createOne, updateOne, readByQuery, readOne };
			}),
			NotificationsService: sinon.stub().callsFake(() => {
				return { createOne: notificationCreateOne };
			}),
		},
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());
	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	app.use(((req: Request, _res: Response, next: NextFunction) => {
		req.accountability = accountability as unknown as Request['accountability'];
		next();
	}) as NextFunction);

	const router = express.Router();
	endpoint(router, endpointContext);
	app.use(router);

	const adoptionCodeGPApiResponse: ProbeToAdopt = {
		userId: null,
		ip: '1.1.1.1',
		name: null,
		altIps: [],
		uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
		tags: [],
		systemTags: [ 'datacenter-network' ],
		status: 'ready',
		isIPv4Supported: true,
		isIPv6Supported: false,
		version: '0.26.0',
		nodeVersion: 'v22.16.0',
		hardwareDevice: 'v1',
		hardwareDeviceFirmware: 'v2.0',
		city: 'Paris',
		state: null,
		stateName: null,
		country: 'FR',
		countryName: 'France',
		continent: 'EU',
		continentName: 'Europe',
		region: 'Western Europe',
		latitude: 48.85,
		longitude: 2.35,
		asn: 12876,
		network: 'SCALEWAY S.A.S.',
		customLocation: null,
		originalLocation: null,
		allowedCountries: [ 'FR' ],
	};

	const adoptedProbe: AdoptedProbe = {
		...adoptionCodeGPApiResponse,
		userId: 'first-user-id',
		id: 'generatedId',
		name: 'probe-fr-paris-01',
		lastSyncDate: new Date(),
		isOutdated: false,
	};
	const row: Row = {
		...adoptedProbe,
		tags: JSON.stringify(adoptedProbe.tags),
		altIps: JSON.stringify(adoptedProbe.altIps),
		systemTags: JSON.stringify(adoptedProbe.systemTags),
		allowedCountries: JSON.stringify(adoptedProbe.allowedCountries),
		originalLocation: JSON.stringify(adoptedProbe.originalLocation),
		customLocation: JSON.stringify(adoptedProbe.customLocation),
		isOutdated: adoptedProbe.isOutdated ? 1 : 0,
		isIPv4Supported: adoptedProbe.isIPv4Supported ? 1 : 0,
		isIPv6Supported: adoptedProbe.isIPv6Supported ? 1 : 0,
	};

	before(() => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
	});

	beforeEach(() => {
		sinon.resetHistory();
		sql.first.reset();
		readByQuery.resolves([]);
		readOne.resolves(adoptedProbe);
		createOne.resolves('generatedId');
		updateOne.resolves('generatedId');

		accountability = {
			user: 'first-user-id',
			admin: false,
		};
	});

	after(() => {
		sandbox.restore();
		nock.cleanAll();
	});

	describe('/adoption-code/send-code endpoint', () => {
		it('should accept ip, generate code and send it to globalping api', async () => {
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(res.text).to.equal('Code was sent to the probe.');
		});

		it('should accept full IPv6 ip, generate code and send it to globalping api', async () => {
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '2a04:4e42:0200:0000:0000:0000:0000:0485',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(res.text).to.equal('Code was sent to the probe.');
		});

		it('should accept short IPv6 ip, generate code and send it to globalping api', async () => {
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '2a04:4e42:200::485',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(res.text).to.equal('Code was sent to the probe.');
		});

		it('should reject non authorized requests', async () => {
			accountability = {};

			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"accountability.user" is required');
		});

		it('should reject requests with another user', async () => {
			const res = await request(app).post('/send-code').send({
				userId: 'another-user-id',
				ip: '1.1.1.1',
			});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('Allowed only for the current user or admin.');
		});

		it('should allow admin requests with another user', async () => {
			accountability = {
				user: 'first-user-id',
				admin: true,
			};

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			const res = await request(app).post('/send-code').send({
				userId: 'another-user-id',
				ip: '1.1.1.1',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(res.text).to.equal('Code was sent to the probe.');
		});

		it('should reject without ip', async () => {
			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
			});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"body.ip" is required');
		});

		it('should reject without userId', async () => {
			const res = await request(app).post('/send-code').send({
				ip: '1.1.1.1',
			});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"body.userId" is required');
		});

		it('should reject with wrong ip', async () => {
			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.863',
			});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"body.ip" must be a valid ip address with a forbidden CIDR');
		});

		it('should reject with duplicate ip', async () => {
			sql.first.resolves({});

			const res = await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});


			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The probe with this IP address is already adopted');
		});
	});

	describe('/adoption-code/verify-code endpoint', () => {
		it('should adopt non-existing probe', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				altIps: [],
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: 'v22.16.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'first-user-id',
				lastSyncDate: new Date(),
				isIPv4Supported: true,
				isIPv6Supported: false,
				allowedCountries: [ 'FR' ],
			});

			expect(res.status).to.equal(200);

			expect(res.body).to.deep.equal({
				id: 'generatedId',
				ip: '1.1.1.1',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				altIps: [],
				name: 'probe-fr-paris-01',
				version: '0.26.0',
				nodeVersion: 'v22.16.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				tags: [],
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				allowedCountries: [ 'FR' ],
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				lastSyncDate: new Date().toISOString(),
				isIPv4Supported: true,
				isIPv6Supported: false,
				isOutdated: false,
				originalLocation: null,
				customLocation: null,
			});

			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should adopt existing but non-adopted probe', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				ip: '1.1.1.1',
				userId: 'first-user-id',
			});

			sql.first.resolves({ ...row, id: 'existing-probe-id', userId: null });

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);

			expect(updateOne.callCount).to.equal(1);
			expect(updateOne.args[0]![0]).to.equal('existing-probe-id');

			expect(updateOne.args[0]![1]).to.deep.equal({
				originalLocation: null,
				customLocation: null,
				name: 'probe-fr-paris-01',
				userId: 'first-user-id',
				tags: [],
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: 'v22.16.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				lastSyncDate: new Date(),
				isIPv4Supported: true,
				isIPv6Supported: false,
				allowedCountries: [ 'FR' ],
			});

			expect(notificationCreateOne.callCount).to.equal(1);
		});

		it('should prefer location info from SQL and metadata from API', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, {
				...adoptionCodeGPApiResponse,
				city: 'Marseille',
				latitude: 43.29,
				longitude: 5.38,
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
			});

			await request(app).post('/send-code').send({
				ip: '1.1.1.1',
				userId: 'first-user-id',
			});

			sql.first.resolves({ ...row, id: 'existing-probe-id', userId: null });

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);

			expect(updateOne.callCount).to.equal(1);
			expect(updateOne.args[0]![0]).to.equal('existing-probe-id');

			expect(updateOne.args[0]![1]).to.deep.equal({
				lastSyncDate: new Date(),
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				allowedCountries: [ 'FR' ],
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				originalLocation: null,
				customLocation: null,
				name: 'probe-fr-paris-01',
				userId: 'first-user-id',
				tags: [],
			});

			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/existing-probe-id) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should adopt probe already adopted by another user', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, {
				...adoptionCodeGPApiResponse,
				city: 'Berlin',
				country: 'DE',
				countryName: 'Germany',
				state: null,
				stateName: null,
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 52.52,
				longitude: 13.405,
				allowedCountries: [ 'DE', 'FR' ],
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
			});

			await request(app).post('/send-code').send({
				ip: '1.1.1.1',
				userId: 'first-user-id',
			});

			sql.first.resolves({
				...row,
				name: 'another-user-probe-01',
				id: 'existing-probe-id',
				userId: 'another-user-id',
				city: 'Berlin',
				country: 'DE',
				countryName: 'Germany',
				state: null,
				stateName: null,
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 52.52,
				longitude: 13.405,
				allowedCountries: JSON.stringify([ 'DE', 'FR' ]),
				customLocation: JSON.stringify({ country: 'DE', city: 'Berlin', state: null, latitude: 52.52, longitude: 13.405 }),
				originalLocation: JSON.stringify({ country: 'FR', city: 'Paris', state: null, latitude: 48.85, longitude: 2.35 }),
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);

			expect(updateOne.callCount).to.equal(1);
			expect(updateOne.args[0]![0]).to.equal('existing-probe-id');

			expect(updateOne.args[0]![1]).to.deep.equal({
				lastSyncDate: new Date(),
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				allowedCountries: [ 'DE', 'FR' ],
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				originalLocation: null,
				customLocation: null,
				name: 'probe-fr-paris-01',
				userId: 'first-user-id',
				tags: [],
			});

			expect(notificationCreateOne.callCount).to.equal(2);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/existing-probe-id) with IP address **1.1.1.1** has been assigned to your account.',
			});

			expect(notificationCreateOne.args[1]?.[0]).to.deep.include({
				recipient: 'another-user-id',
				subject: 'Probe unassigned',
				message: 'Your probe **another-user-probe-01** with IP address **1.1.1.1** has been reassigned to another user (it reported an adoption token of another user).',
			});
		});

		it('should not accept valid verification code if request to GP api failed', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(504);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			readOne.resolves({ ...adoptedProbe, name: null });

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(createOne.callCount).to.equal(0);
		});

		it('should accept valid verification code with spaces', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code: ` ${[ ...code ].join(' ')} `,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				lastSyncDate: new Date(),
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: 'v22.16.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				allowedCountries: [ 'FR' ],
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				userId: 'first-user-id',
				name: 'probe-fr-paris-01',
			});
		});

		it('should reject non authorized requests', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			accountability = {};

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(res.text).to.deep.equal('"accountability.user" is required');
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject another user requests', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'another-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(res.text).to.deep.equal('Allowed only for the current user or admin.');
			expect(createOne.callCount).to.equal(0);
		});

		it('should allow another user admin requests', async () => {
			accountability = {
				user: 'first-user-id',
				admin: true,
			};

			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'another-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'another-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(createOne.callCount).to.equal(1);

			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'another-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should reject without code', async () => {
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(res.text).to.deep.equal('"body.code" is required');
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject without userId', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(res.text).to.deep.equal('"body.userId" is required');
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject with wrong code', async () => {
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code: 'KLS67',
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(400);
			expect(res.text).to.deep.equal('Invalid code');
			expect(createOne.callCount).to.equal(0);
		});

		it('should assign correct default name', async () => {
			let code = '';

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, adoptionCodeGPApiResponse);

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			readByQuery.resolves([{ id: 'otherProbeId' }]);

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(createOne.callCount).to.equal(1);
			expect(createOne.args[0]?.[0].name).to.deep.equal('probe-fr-paris-02');

			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-02**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should send notification if firmware is outdated', async () => {
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, {
				...adoptionCodeGPApiResponse,
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				hardwareDeviceFirmware: 'v1.9',
			});

			await request(app).post('/send-code').send({
				userId: 'first-user-id',
				ip: '1.1.1.1',
			});

			readByQuery.resolves([{ id: 'otherProbeId' }]);
			readOne.resolves({ ...adoptedProbe, hardwareDeviceFirmware: 'v1.9', isOutdated: true });

			const res = await request(app).post('/verify-code').send({
				userId: 'first-user-id',
				code,
			});

			expect(nock.isDone()).to.equal(true);
			expect(res.status).to.equal(200);
			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0].name).to.deep.equal('probe-fr-paris-02');

			expect(notificationCreateOne.callCount).to.equal(2);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.equal({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-02**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});

			expect(notificationCreateOne.args[1]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				item: 'generatedId',
				collection: 'gp_probes',
				type: 'outdated_firmware',
				secondary_type: 'v2.0_v22.16.0',
				subject: 'Your hardware probe is running an outdated firmware',
				message: 'Your probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** is running an outdated firmware and we couldn\'t update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.',
			});
		});
	});

	describe('/adoption-code/adopt-by-token endpoint', () => {
		const adoptionTokenRequest = {
			probe: {
				userId: null,
				ip: '1.1.1.1',
				name: null,
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				tags: [],
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				customLocation: null,
				allowedCountries: [ 'FR' ],
			},
			user: { id: 'first-user-id' },
		};

		it('should adopt unassigned probe', async () => {
			const res = await request(app).put('/adopt-by-token').set('x-api-key', 'system').send(adoptionTokenRequest);

			expect(res.status).to.equal(200);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.include({
				lastSyncDate: new Date(),
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				isIPv4Supported: true,
				isIPv6Supported: false,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				allowedCountries: [ 'FR' ],
				city: 'Paris',
				state: null,
				stateName: null,
				country: 'FR',
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 48.85,
				longitude: 2.35,
				userId: 'first-user-id',
				name: 'probe-fr-paris-01',
			});


			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should adopt assigned probe', async () => {
			sql.first.resolves({
				...row,
				id: 'existing-probe-id',
				name: 'other-user-probe-01',
				userId: 'another-user-id',
				city: 'Berlin',
				country: 'DE',
				countryName: 'Germany',
				state: null,
				stateName: null,
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				latitude: 52.52,
				longitude: 13.405,
				allowedCountries: JSON.stringify([ 'DE', 'FR' ]),
				customLocation: JSON.stringify({ country: 'DE', city: 'Berlin', state: null, latitude: 52.52, longitude: 13.405 }),
				originalLocation: JSON.stringify({ country: 'FR', city: 'Paris', state: null, latitude: 48.85, longitude: 2.35 }),
			});

			const res = await request(app).put('/adopt-by-token').set('x-api-key', 'system').send(adoptionTokenRequest);

			expect(res.status).to.equal(200);

			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]).to.deep.equal([
				'existing-probe-id',
				{
					lastSyncDate: new Date(),
					ip: '1.1.1.1',
					altIps: [],
					uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
					version: '0.27.0',
					nodeVersion: 'v22.17.0',
					hardwareDevice: 'v2',
					hardwareDeviceFirmware: 'v2.1',
					systemTags: [ 'datacenter-network' ],
					status: 'ready',
					isIPv4Supported: true,
					isIPv6Supported: false,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
					allowedCountries: [ 'DE', 'FR' ],
					city: 'Paris',
					state: null,
					stateName: null,
					country: 'FR',
					countryName: 'France',
					continent: 'EU',
					continentName: 'Europe',
					region: 'Western Europe',
					latitude: 48.85,
					longitude: 2.35,
					originalLocation: null,
					customLocation: null,
					name: 'probe-fr-paris-01',
					userId: 'first-user-id',
					tags: [],
				},
				{ emitEvents: false },
			]);


			expect(notificationCreateOne.callCount).to.equal(2);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'first-user-id',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/existing-probe-id) with IP address **1.1.1.1** has been assigned to your account.',
			});

			expect(notificationCreateOne.args[1]?.[0]).to.deep.include({
				recipient: 'another-user-id',
				subject: 'Probe unassigned',
				message: 'Your probe **other-user-probe-01** with IP address **1.1.1.1** has been reassigned to another user (it reported an adoption token of another user).',
			});
		});

		it('should adopt offline probe by asn/city', async () => {
			sql.first.onFirstCall().resolves(null);

			sql.first.resolves({
				...row,
				name: 'offline-probe-01',
				id: 'offlineProbeId',
				ip: '2.2.2.2',
				uuid: 'offlineProbeUuid',
				version: '0.1.0',
				nodeVersion: 'v18.0.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v1.6',
			});

			const res = await request(app).put('/adopt-by-token').set('x-api-key', 'system').send(adoptionTokenRequest);

			expect(res.status).to.equal(200);


			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]?.[0]).to.deep.equal('offlineProbeId');

			expect(updateOne.args[0]?.[1]).to.deep.include({
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'first-user-id',
				isIPv4Supported: true,
				isIPv6Supported: false,
			});

			expect(notificationCreateOne.callCount).to.equal(0);
		});

		it('should only update data if probe already assigned to that user', async () => {
			sql.first.resolves({
				...row,
				id: 'assignedProbeId',
				name: 'existing-probe-name',
				userId: 'first-user-id',
				ip: '2.2.2.2',
				uuid: 'assignedProbeUuid',
				version: '0.27.0',
				nodeVersion: 'v22.17.0',
				hardwareDevice: 'v2',
				hardwareDeviceFirmware: 'v2.1',
			});

			const res = await request(app).put('/adopt-by-token').set('x-api-key', 'system').send(adoptionTokenRequest);

			expect(res.status).to.equal(200);


			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]).to.deep.equal([
				'assignedProbeId',
				{
					lastSyncDate: new Date(),
					ip: '1.1.1.1',
					altIps: [],
					uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
					version: '0.27.0',
					nodeVersion: 'v22.17.0',
					hardwareDevice: 'v2',
					hardwareDeviceFirmware: 'v2.1',
					systemTags: [ 'datacenter-network' ],
					status: 'ready',
					isIPv4Supported: true,
					isIPv6Supported: false,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
				},
				{ emitEvents: false },
			]);

			expect(notificationCreateOne.callCount).to.equal(0);
		});

		it('should reject without system token', async () => {
			const res = await request(app).put('/adopt-by-token').send(adoptionTokenRequest);

			expect(res.status).to.equal(403);

			expect(createOne.callCount).to.equal(0);
			expect(notificationCreateOne.callCount).to.equal(0);
		});
	});
});
