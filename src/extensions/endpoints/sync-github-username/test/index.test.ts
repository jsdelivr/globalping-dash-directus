import nock from 'nock';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Router } from 'express';
import type { EndpointExtensionContext } from '@directus/extensions';
import endpoint from '../src/index.js';

const updateOne = sinon.stub();
const readOne = sinon.stub().resolves({
	external_identifier: 'github-id',
	github: 'old-username',
});
const itemsServiceStub = sinon.stub().returns({
	readOne,
});
const usersServiceStub = sinon.stub().returns({
	updateOne,
});
const endpointContext = {
	logger: {
		error: console.error,
	},
	env: {
		GITHUB_ACCESS_TOKEN: 'your-github-access-token',
	},
	services: {
		ItemsService: itemsServiceStub,
		UsersService: usersServiceStub,
	},
	database: {},
	getSchema: sinon.stub().resolves({}),
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

after(() => {
	nock.cleanAll();
});

describe('Sync Github Username endpoint', () => {
	it('should sync GitHub username', async () => {
		endpoint(router, endpointContext);
		const req = {
			accountability: {
				user: 'requester-id',
			},
			body: {
				userId: 'user-id',
			},
		};

		nock('https://api.github.com').get('/user/github-id').reply(200, {
			login: 'new-username',
		});

		await request('/', req, res);

		expect(nock.isDone()).to.equal(true);
		expect(resSend.callCount).to.equal(1);
		expect(resSend.args[0]).to.deep.equal([ 'Synced' ]);
		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0][1]).to.deep.equal({
			github: 'new-username',
		});
	});

	it('should reject non authorized requests', async () => {
		endpoint(router, endpointContext);
		const req = {
			body: {
				userId: 'user-id',
			},
		};

		await request('/', req, res);

		expect(resStatus.callCount).to.equal(1);
		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.callCount).to.equal(1);
		expect(resSend.args[0]).to.deep.equal([ '"accountability" is required' ]);
	});

	it('should reject without userId', async () => {
		endpoint(router, endpointContext);
		const req = {
			accountability: {
				user: 'requester-id',
			},
			body: {},
		};

		await request('/', req, res);

		expect(resStatus.callCount).to.equal(1);
		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.callCount).to.equal(1);
		expect(resSend.args[0]).to.deep.equal([ '"body.userId" is required' ]);
	});

	it('should handle not enough data error', async () => {
		endpoint(router, endpointContext);
		const req = {
			accountability: {
				user: 'requester-id',
			},
			body: {
				userId: 'user-id',
			},
		};

		readOne.resolves({});

		await request('/', req, res);

		expect(resStatus.callCount).to.equal(1);
		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.callCount).to.equal(1);
		expect(resSend.args[0]).to.deep.equal([ 'Not enough data to check GitHub username' ]);
	});

	it('should handle internal server error', async () => {
		endpoint(router, endpointContext);
		const req = {
			accountability: {
				user: 'requester-id',
			},
			body: {
				userId: 'user-id',
			},
		};

		readOne.rejects(new Error('Internal Server Error'));

		await request('/', req, res);

		expect(resStatus.callCount).to.equal(1);
		expect(resStatus.args[0]).to.deep.equal([ 500 ]);
		expect(resSend.callCount).to.equal(1);
		expect(resSend.args[0]).to.deep.equal([ 'Internal Server Error' ]);
	});
});
