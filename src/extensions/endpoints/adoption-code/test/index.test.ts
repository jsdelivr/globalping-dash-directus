import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { Router } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import endpoint from '../src/index.js';

describe('adoption code endpoints', () => {
	const createOne = sinon.stub().resolves('generatedId');
	const readByQuery = sinon.stub().resolves([]);
	const orWhere = sinon.stub().resolves([]);
	const endpointContext = {
		logger: {
			error: console.error,
		},
		getSchema: () => {},
		database: () => ({
			whereRaw: () => ({
				orWhere,
			}),
		}),
		env: {
			GLOBALPING_URL: 'https://api.globalping.io/v1',
			GP_SYSTEM_KEY: 'system',
		},
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return { createOne, readByQuery };
			}),
		},
	} as unknown as EndpointExtensionContext;
	const resSend = sinon.stub();
	const resStatus = sinon.stub().returns({ send: resSend });
	const res = { status: resStatus, send: resSend };

	const routes: Record<string, (request: object, response: typeof res) => void> = {};
	const request = (route: string, request: object, response: typeof res) => {
		const handler = routes[route];

		if (!handler) {
			throw new Error('Handler for the route is not defined');
		}

		return handler(request, response);
	};
	const router = {
		post: (route: string, handler: (request: object, response: typeof res) => void) => {
			routes[route] = handler;
		},
	} as unknown as Router;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
		readByQuery.resolves([]);
		orWhere.resolves([]);
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
				},
				body: {
					ip: '1.1.1.1',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
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
				},
				body: {
					ip: '2a04:4e42:0200:0000:0000:0000:0000:0485',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
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
				},
				body: {
					ip: '2a04:4e42:200::485',
				},
			};
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('2a04:4e42:200::485');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
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

		it('should reject without ip', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {},
			};

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ '"body.ip" is required' ]);
		});

		it('should reject with wrong ip', async () => {
			endpoint(router, endpointContext);
			const req = {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
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
				},
				body: {
					ip: '1.1.1.1',
				},
			};

			orWhere.resolves([{}]);

			await request('/send-code', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
			expect(resSend.args[0]).to.deep.equal([ 'The probe with this IP address is already adopted' ]);
		});
	});

	describe('/adoption-code/verify-code endpoint', () => {
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
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				status: 'ready',
				systemTags: [ 'datacenter-network' ],
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					ip: '1.1.1.1',
					name: 'probe-fr-paris-01',
					version: '0.26.0',
					nodeVersion: '18.17.0',
					hardwareDevice: 'v1',
					status: 'ready',
					systemTags: [ 'datacenter-network' ],
					city: 'Paris',
					state: null,
					country: 'FR',
					latitude: 48.8534,
					longitude: 2.3488,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
					lastSyncDate: new Date(),
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				status: 'ready',
				systemTags: [ 'datacenter-network' ],
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
			});
		});

		it('should accept valid verification code even if request to GP api failed', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(504);

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Request failed with status code 504' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					ip: '1.1.1.1',
					name: null,
					version: null,
					nodeVersion: null,
					hardwareDevice: null,
					status: 'offline',
					systemTags: [],
					city: null,
					state: null,
					country: null,
					latitude: null,
					longitude: null,
					asn: null,
					network: null,
					lastSyncDate: new Date(),
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				name: null,
				uuid: null,
				version: null,
				nodeVersion: null,
				hardwareDevice: null,
				status: 'offline',
				systemTags: [],
				city: null,
				state: null,
				country: null,
				latitude: null,
				longitude: null,
				asn: null,
				network: null,
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
			});
		});

		it('should accept valid verification code with spaces', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				systemTags: [],
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					code: ` ${[ ...code ].join(' ')} `,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);

			expect(resSend.args[1]).to.deep.equal([
				{
					id: 'generatedId',
					ip: '1.1.1.1',
					name: 'probe-fr-paris-01',
					version: '0.26.0',
					nodeVersion: '18.17.0',
					hardwareDevice: null,
					status: 'ready',
					systemTags: [],
					city: 'Paris',
					state: null,
					country: 'FR',
					latitude: 48.8534,
					longitude: 2.3488,
					asn: 12876,
					network: 'SCALEWAY S.A.S.',
					lastSyncDate: new Date(),
				},
			]);

			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				ip: '1.1.1.1',
				name: 'probe-fr-paris-01',
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				systemTags: [],
				city: 'Paris',
				state: null,
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
				userId: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				lastSyncDate: new Date(),
			});
		});

		it('should reject non authorized requests', async () => {
			endpoint(router, endpointContext);
			let code = '';
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				code = body.code;
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				body: {
					code,
				},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ '"accountability" is required' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject without code', async () => {
			endpoint(router, endpointContext);

			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {},
			}, res);

			expect(nock.isDone()).to.equal(true);
			expect(resSend.callCount).to.equal(2);
			expect(resSend.args[0]).to.deep.equal([ 'Code was sent to the probe.' ]);
			expect(resSend.args[1]).to.deep.equal([ '"body.code" is required' ]);
			expect(createOne.callCount).to.equal(0);
		});

		it('should reject with wrong code', async () => {
			endpoint(router, endpointContext);

			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				expect(body.ip).to.equal('1.1.1.1');
				expect(body.code.length).to.equal(6);
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: null,
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
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

			// First adoption
			nock('https://api.globalping.io').post('/v1/adoption-code?systemkey=system', (body) => {
				code = body.code;
				return true;
			}).reply(200, {
				uuid: '35cadbfd-2079-4b1f-a4e6-5d220035132a',
				version: '0.26.0',
				nodeVersion: '18.17.0',
				hardwareDevice: 'v1',
				status: 'ready',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8534,
				longitude: 2.3488,
				asn: 12876,
				network: 'SCALEWAY S.A.S.',
			});

			await request('/send-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
					ip: '1.1.1.1',
				},
			}, res);

			readByQuery.resolves([{}]);

			await request('/verify-code', {
				accountability: {
					user: 'f3115997-31d1-4cf5-8b41-0617a99c5706',
				},
				body: {
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
	});
});
