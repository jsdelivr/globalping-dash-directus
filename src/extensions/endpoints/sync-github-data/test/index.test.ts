import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import request from 'supertest';
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
			GITHUB_ACCESS_TOKEN: 'default-github-token',
		},
		services: {
			ItemsService: itemsServiceStub,
			UsersService: usersServiceStub,
		},
		database: {},
		getSchema: sinon.stub().resolves({}),
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

	before(() => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
	});

	beforeEach(() => {
		sinon.resetHistory();

		readOne.reset();

		readOne.resolves({
			external_identifier: 'github-id',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: 'user-github-token',
		});

		accountability = {
			user: 'directus-id',
			admin: false,
		};
	});

	after(() => {
		nock.cleanAll();
	});

	it('should sync GitHub data', async () => {
		nock('https://api.github.com').get('/user/github-id').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com').get('/user/orgs').reply(200, [{
			login: 'new-org',
		}]);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0]?.[1]).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});
	});

	it('should work if requester is admin', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		nock('https://api.github.com').get('/user/github-id').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com').get('/user/orgs').reply(200, [{
			login: 'new-org',
		}]);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0]?.[1]).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});
	});

	it('should work if current github data is null', async () => {
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

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0]?.[1]).to.deep.equal({
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		});
	});

	it('should retry with default github token if user token failed', async () => {
		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-github-token')
			.get('/user/github-id')
			.reply(401);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer default-github-token')
			.get('/user/github-id')
			.reply(200, {
				login: 'new-username',
			});

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-github-token')
			.get('/user/orgs')
			.reply(401);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer default-github-token')
			.get('/user/github-id/orgs')
			.reply(200, [{
				login: 'new-org',
			}]);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);
	});

	it('should use default github token if user token is null', async () => {
		readOne.resolves({
			external_identifier: 'github-id',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: null,
		});

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer default-github-token')
			.get('/user/github-id')
			.reply(200, {
				login: 'new-username',
			});

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer default-github-token')
			.get('/user/github-id/orgs')
			.reply(200, [{
				login: 'new-org',
			}]);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);
	});

	it('should not call update if data is the same', async () => {
		nock('https://api.github.com').get('/user/github-id').reply(200, {
			login: 'old-username',
		});

		nock('https://api.github.com').get('/user/orgs').reply(200, [{
			login: 'old-org',
		}]);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
		});

		expect(readOne.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(0);
	});

	it('should reject non authorized requests', async () => {
		accountability = undefined;

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"accountability" is required');
	});

	it('should reject without userId', async () => {
		const res = await request(app).post('/').send({});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('"body.userId" is required');
	});

	it('should handle not enough data error', async () => {
		readOne.resolves({});

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Not enough data to sync with GitHub');
	});

	it('should handle internal server error', async () => {
		readOne.rejects(new Error('Internal Server Error'));

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(500);
		expect(res.text).to.equal('Internal Server Error');
	});
});
