import nock from 'nock';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Router } from 'express';
import { EndpointExtensionContext } from '@directus/types';
import endpoint from '../src/index.js';

const createOne = sinon.stub();
const endpointContext = {
	logger: {
		error: console.error,
	},
	env: {
		GP_SEND_CODE_ENDPOINT: 'https://api.globalping.io/v1/adoption-code',
		GP_SYSTEM_KEY: 'system',
	},
	services: {
		ItemsService: sinon.stub().callsFake(() => {
			return { createOne };
		}),
	},
} as unknown as EndpointExtensionContext;
const resSend = sinon.stub();
const resStatus = sinon.stub().returns({ send: resSend });
const res = { status: resStatus, send: resSend };

const routes = {};
const request = (route, req, res) => {
	const handler = routes[route];

	if (!handler) {
		throw new Error('Handler for the route is not defined');
	}

	return handler(req, res);
};
const router = { post: (route, handler) => { routes[route] = handler; } } as Router;

before(() => {
	nock.disableNetConnect();
});

beforeEach(() => {
	sinon.resetHistory();
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
			result: 'Code was sent to the probe.',
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
		expect(resSend.args[0]).to.deep.equal([ '"body.ip" must be a valid ip address with a optional CIDR' ]);
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
			result: 'Code was sent to the probe.',
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
		expect(resSend.args[1]).to.deep.equal([ 'Code successfully validated. Probe was assigned to you.' ]);
		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0][0]).to.deep.equal({
			ip: '1.1.1.1',
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
			result: 'Code was sent to the probe.',
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
		expect(resSend.args[1]).to.deep.equal([ 'Code successfully validated. Probe was assigned to you.' ]);
		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0][0]).to.deep.equal({
			ip: '1.1.1.1',
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
			result: 'Code was sent to the probe.',
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
			result: 'Code was sent to the probe.',
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
			result: 'Code was sent to the probe.',
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
		expect(resSend.args[1]).to.deep.equal([ 'Code is not valid' ]);
		expect(createOne.callCount).to.equal(0);
	});
});
