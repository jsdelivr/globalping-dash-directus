import nock from 'nock';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Router } from 'express';
import type { EndpointExtensionContext } from '@directus/extensions';
import endpoint from '../src/index.js';

describe('/sync-github-data endpoint', () => {
	const updateOne = sinon.stub();
	const readOne = sinon.stub();
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

		readOne.resolves({
			external_identifier: 'github-id',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
		});
	});

	after(() => {
		nock.cleanAll();
	});

	it('should sync GitHub data', async () => {
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

		nock('https://api.github.com').get('/user/github-id/orgs').reply(200, [{
			login: 'new-org',
		}]);

		await request('/', req, res);

		expect(nock.isDone()).to.equal(true);
		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]).to.deep.equal([{
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		}]);

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0][1]).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});
	});

	it('should work if current github data is null', async () => {
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

		nock('https://api.github.com').get('/user/github-id/orgs').reply(200, [{
			login: 'new-org',
		}]);

		readOne.resolves({
			external_identifier: 'github-id',
			github_username: null,
			github_organizations: [],
		});

		await request('/', req, res);

		expect(nock.isDone()).to.equal(true);
		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]).to.deep.equal([{
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		}]);

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0][1]).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});
	});

	it('should not call update if data is the same', async () => {
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
			login: 'old-username',
		});

		nock('https://api.github.com').get('/user/github-id/orgs').reply(200, [{
			login: 'old-org',
		}]);

		await request('/', req, res);

		expect(nock.isDone()).to.equal(true);
		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]).to.deep.equal([{
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
		}]);

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(0);
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
		expect(resSend.args[0]).to.deep.equal([ 'Not enough data to sync with GitHub' ]);
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
