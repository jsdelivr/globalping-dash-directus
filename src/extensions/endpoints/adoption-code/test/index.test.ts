import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { Router } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import endpoint from '../src/index.js';

describe('adoption code endpoints', () => {
	const createOne = sinon.stub();
	const updateOne = sinon.stub();
	const readByQuery = sinon.stub();
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
		},
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return { createOne, updateOne, readByQuery };
			}),
			NotificationsService: sinon.stub().callsFake(() => {
				return { createOne: notificationCreateOne };
			}),
		},
	} as unknown as EndpointExtensionContext;
	const resSend = sinon.stub();
	const resStatus = sinon.stub().returns({ send: resSend });
	const resSendStatus = sinon.stub();
	const res = { status: resStatus, send: resSend, sendStatus: resSendStatus };

	const routes: Record<string, (request: object, response: typeof res) => Promise<void>> = {};
	const request = (route: string, request: object, response: typeof res) => {
		const handler = routes[route];

		if (!handler) {
			throw new Error('Handler for the route is not defined');
		}

		return handler(request, response);
	};
	const router = {
		post: (route: string, handler: (request: object, response: typeof res) => Promise<void>) => {
			routes[route] = handler;
		},
		put: (route: string, handler: (request: object, response: typeof res) => Promise<void>) => {
			routes[route] = handler;
		},
	} as unknown as Router;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
		sql.first.reset();
		readByQuery.resolves([]);
		createOne.resolves('generatedId');
		updateOne.resolves('generatedId');
	});

	after(() => {
		nock.cleanAll();
	});

	describe('/adoption-code/send-code endpoint', () => {
		it('should accept ip, generate code and send it to globalping api', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', req, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
		});

		it('should accept full IPv6 ip, generate code and send it to globalping api', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '2a04:4e42:0200:0000:0000:0000:0000:0485',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', req, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
		});

		it('should accept short IPv6 ip, generate code and send it to globalping api', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '2a04:4e42:200::485',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', req, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
		});

		it('should reject non authorized requests', async () => {
			endpoint(router, endpointContext);
			const req = {
				body: {
					ip: '1.1.1.1',
				},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ '"accountability" is required' ]);
		});

		it('should reject requests with another user', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'anotherUserId',
					ip: '1.1.1.1',
				},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'Allowed only for the current user or admin.' ]);
		});

		it('should allow admin requests with another user', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: true,
				},
				body: {
					userId: 'anotherUserId',
					ip: '1.1.1.1',
				},
			};

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', req, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
		});

		it('should reject without ip', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ '"body.ip" is required' ]);
		});

		it('should reject without userId', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					ip: '1.1.1.1',
				},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ '"body.userId" is required' ]);
		});

		it('should reject with wrong ip', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.863',
				},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ '"body.ip" must be a valid ip address with a forbidden CIDR' ]);
		});

		it('should reject with duplicate ip', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			};

			sql.first.resolves({});

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'The probe with this IP address is already adopted' ]);
		});
	});

	describe('/adoption-code/verify-code endpoint', () => {
		const defaultAdoptionCodeResponse = {
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
			nodeVersion: '18.17.0',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v2.0',
			city: 'Paris',
			state: null,
			country: 'FR',
			latitude: 48.85,
			longitude: 2.35,
			asn: 12876,
			network: 'SCALEWAY S.A.S.',
			customLocation: null,
		};
		let sandbox: sinon.SinonSandbox;

		beforeEach(() => {
			sandbox = sinon.createSandbox({ useFakeTimers: true });
		});

		afterEach(() => {
			sandbox.restore();
		});

		it('should accept valid verification code', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					ip: '1.1.1.1',
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					name: 'probe-fr-paris-01',
					ip: '1.1.1.1',
					version: '0.26.0',
					nodeVersion: '18.17.0',
					hardwareDevice: 'v1',
					hardwareDeviceFirmware: 'v2.0',
					systemTags: [ 'datacenter-network' ],
					status: 'ready',
					city: 'Paris',
					state: null,
					country: 'FR',
					latitude: 48.85,
					longitude: 2.35,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
					lastSyncDate: new Date(),
					isIPv4Supported: true,
					isIPv6Supported: false,
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				altIps: [],
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
				isIPv4Supported: true,
				isIPv6Supported: false,
			});
		});

		it('should adopt already synced non-adopted probe', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					ip: '1.1.1.1',
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
			}, res);

			sql.first.resolves({ id: 'existing-unassigned-probe-id' });

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);

			expect(updateOne.callCount).to.equal(1);
			expect(updateOne.args[0]![0]).to.equal('existing-unassigned-probe-id');

			expect(updateOne.args[0]![1]).to.deep.equal({
				name: 'probe-fr-paris-01',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				tags: '[]',
				customLocation: null,
			});
		});

		it('should accept valid verification code even if request to GP api failed', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(504);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Request failed with status code 504' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					name: null,
					ip: '1.1.1.1',
					version: null,
					nodeVersion: null,
					hardwareDevice: null,
					hardwareDeviceFirmware: null,
					systemTags: [],
					status: 'offline',
					city: null,
					state: null,
					country: null,
					latitude: null,
					longitude: null,
					asn: null,
					network: null,
					lastSyncDate: new Date(),
					isIPv4Supported: false,
					isIPv6Supported: false,
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				altIps: [],
				name: null,
				uuid: null,
				version: null,
				nodeVersion: null,
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				systemTags: [],
				status: 'offline',
				city: null,
				state: null,
				country: null,
				latitude: null,
				longitude: null,
				asn: null,
				network: null,
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
				isIPv4Supported: false,
				isIPv6Supported: false,
			});
		});

		it('should accept valid verification code with spaces', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code: ` ${[ ...code ].join(' ')} `,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					name: 'probe-fr-paris-01',
					ip: '1.1.1.1',
					version: '0.26.0',
					nodeVersion: '18.17.0',
					hardwareDevice: 'v1',
					hardwareDeviceFirmware: 'v2.0',
					systemTags: [ 'datacenter-network' ],
					status: 'ready',
					city: 'Paris',
					state: null,
					country: 'FR',
					latitude: 48.85,
					longitude: 2.35,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
					lastSyncDate: new Date(),
					isIPv4Supported: true,
					isIPv6Supported: false,
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				altIps: [],
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
				isIPv4Supported: true,
				isIPv6Supported: false,
			});
		});

		it('should reject non authorized requests', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ '"accountability" is required' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject another user requests', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'anotherUserId',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ 'Allowed only for the current user or admin.' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should allow another user admin requests', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: true,
				},
				body: {
					userId: 'anotherUserId',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: true,
				},
				body: {
					userId: 'anotherUserId',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(createOne.callCount).to.equal(1);
		});

		it('should reject without code', async () => {
			endpoint(router, endpointContext);

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ '"body.code" is required' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject without userId', async () => {
			endpoint(router, endpointContext);

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ '"body.userId" is required' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject with wrong code', async () => {
			endpoint(router, endpointContext);

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code: 'KLS67',
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ 'Invalid code' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should assign correct default name', async () => {
			endpoint(router, endpointContext);
			let code = '';

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, defaultAdoptionCodeResponse);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			readByQuery.resolves([{}]);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(createOne.callCount).to.equal(1);

			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]?.[0].name).to.deep.equal('probe-fr-paris-02');
			expect(createOne.args[0]?.[0].name).to.deep.equal('probe-fr-paris-02');
		});

		it('should send notification if firmware is outdated', async () => {
			endpoint(router, { ...endpointContext, env: { ...endpointContext.env, TARGET_HW_DEVICE_FIRMWARE: 'v2.0' } });
			let code = '';

			nock('https://api.globalping.io').post('/v1/adoption-code', (body) => {
				code = body.code;
				return true;
			}).reply(200, {
				...defaultAdoptionCodeResponse,
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				hardwareDeviceFirmware: 'v1.9',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					ip: '1.1.1.1',
				},
			}, res);

			readByQuery.resolves([{}]);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					admin: false,
				},
				body: {
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(createOne.callCount).to.equal(1);

			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]?.[0].name).to.deep.equal('probe-fr-paris-02');
			expect(createOne.args[0]?.[0].name).to.deep.equal('probe-fr-paris-02');

			expect(notificationCreateOne.args[0]?.[0]).to.deep.equal({
				recipient: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-02**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
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
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				customLocation: null,
			},
			user: { id: 'f3115997-31d1-4cf5-8b41-0617a99c5706' },
		};

		it('should adopt unassigned probe', async () => {
			endpoint(router, endpointContext);

			await request('/adopt-by-token', {
				headers: {
					'x-api-key': 'system',
				},
				body: adoptionTokenRequest,
			}, res);


			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.include({
				ip: '1.1.1.1',
				altIps: [],
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				isIPv4Supported: true,
				isIPv6Supported: false,
			});


			expect(notificationCreateOne.callCount).to.equal(1);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});
		});

		it('should adopt assigned probe', async () => {
			endpoint(router, endpointContext);

			sql.first.resolves({
				id: 'assignedProbeId',
				name: 'other-user-probe-01',
				ip: '1.1.1.1',
				userId: 'otherUserId',
			});

			await request('/adopt-by-token', {
				headers: {
					'x-api-key': 'system',
				},
				body: adoptionTokenRequest,
			}, res);


			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]).to.deep.equal([
				'assignedProbeId',
				{
					name: 'probe-fr-paris-01',
					userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
					tags: '[]',
					customLocation: null,
				},
				{ emitEvents: false },
			]);


			expect(notificationCreateOne.callCount).to.equal(2);

			expect(notificationCreateOne.args[0]?.[0]).to.deep.include({
				recipient: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				subject: 'New probe adopted',
				message: 'A new probe [**probe-fr-paris-01**](/probes/generatedId) with IP address **1.1.1.1** has been assigned to your account.',
			});

			expect(notificationCreateOne.args[1]?.[0]).to.deep.include({
				recipient: 'otherUserId',
				subject: 'Probe unassigned',
				message: 'Your probe **other-user-probe-01** with IP address **1.1.1.1** has been reassigned to another user (it reported an adoption token of another user).',
			});
		});

		it('should adopt offline probe by asn/city', async () => {
			endpoint(router, endpointContext);

			sql.first.onFirstCall().resolves(null);

			sql.first.resolves({
				id: 'offlineProbeId',
				ip: '2.2.2.2',
				uuid: 'offlineProbeUuid',
			});

			await request('/adopt-by-token', {
				headers: {
					'x-api-key': 'system',
				},
				body: adoptionTokenRequest,
			}, res);


			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(1);

			expect(updateOne.args[0]?.[0]).to.deep.equal('offlineProbeId');

			expect(updateOne.args[0]?.[1]).to.deep.include({
				ip: '1.1.1.1',
				altIps: [],
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v2.0',
				systemTags: [ 'datacenter-network' ],
				status: 'ready',
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.85,
				longitude: 2.35,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				isIPv4Supported: true,
				isIPv6Supported: false,
			});

			expect(notificationCreateOne.callCount).to.equal(0);
		});

		it('should do nothing if already assigned to that user', async () => {
			endpoint(router, endpointContext);

			sql.first.resolves({
				id: 'assignedProbeId',
				name: 'other-user-probe-01',
				ip: '1.1.1.1',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
			});

			await request('/adopt-by-token', {
				headers: {
					'x-api-key': 'system',
				},
				body: adoptionTokenRequest,
			}, res);


			expect(createOne.callCount).to.equal(0);
			expect(updateOne.callCount).to.equal(0);
			expect(notificationCreateOne.callCount).to.equal(0);
		});

		it('should reject without system token', async () => {
			endpoint(router, endpointContext);
			const result = await request('/adopt-by-token', {
				headers: {},
				body: adoptionTokenRequest,
			}, res);

			console.log(result);
			expect(createOne.callCount).to.equal(0);
			expect(notificationCreateOne.callCount).to.equal(0);
			expect(resStatus.args[0]?.[0]).equal(403);
		});
	});
});
