import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import request from 'supertest';
import { getLinkGenerator } from '../../../lib/src/link-generator.js';
import endpoint, { rateLimiter } from '../src/index.js';

describe('/sync-github-data endpoint', () => {
	const updateOne = sinon.stub();
	const updateByQuery = sinon.stub();
	const createNotification = sinon.stub();
	const readOne = sinon.stub();
	const readByQuery = sinon.stub();
	const itemsCreateOne = sinon.stub();
	const itemsUpdateOne = sinon.stub();
	const deleteMany = sinon.stub();
	const itemsServiceStub = sinon.stub().returns({
		readOne,
		readByQuery,
		createOne: itemsCreateOne,
		updateOne: itemsUpdateOne,
		deleteMany,
	});
	const usersServiceStub = sinon.stub().returns({
		updateOne,
		updateByQuery,
	});
	const notificationsServiceStub = sinon.stub().returns({
		createOne: createNotification,
	});
	const endpointContext = {
		logger: {
			error: console.error,
		},
		env: {
			GITHUB_ACCESS_TOKEN: 'default-github-token',
			DASH_URL: 'https://dash.globalping.io',
			PUBLIC_URL: 'https://dash-directus.globalping.io',
			SECRET: 'test-secret',
		},
		services: {
			ItemsService: itemsServiceStub,
			UsersService: usersServiceStub,
			NotificationsService: notificationsServiceStub,
		},
		database: {
			transaction: async (callback: (trx: unknown) => unknown) => callback({}),
		},
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

	beforeEach(async () => {
		sinon.resetHistory();

		await Promise.all([
			rateLimiter.delete('directus-id'),
			rateLimiter.delete('admin-id'),
		]);

		readOne.reset();
		readByQuery.reset();
		readByQuery.resolves([]);
		itemsCreateOne.resolves('created-id');
		deleteMany.resolves();

		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: 'user-github-token',
		});

		accountability = {
			user: 'directus-id',
			admin: false,
		};
	});

	afterEach(() => {
		nock.cleanAll();
	});

	it('should sync GitHub data', async () => {
		nock('https://api.github.com').get('/user/123456').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

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

		nock('https://api.github.com').get('/user/123456').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

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
		nock('https://api.github.com').get('/user/123456').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: null,
			github_organizations: [],
			github_oauth_token: 'user-github-token',
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

	describe('org sync', () => {
		// The lists the sync reads: the orgs it already knows by github id, and the memberships of the user.
		const seedDirectus = ({ orgs = [], memberships = [] }: { orgs?: unknown[]; memberships?: unknown[] }) => {
			readByQuery.reset();

			readByQuery.callsFake(async (query: { filter?: { github_id?: unknown; user?: unknown } }) => {
				if (query?.filter?.github_id) { return orgs; }

				if (query?.filter?.user) { return memberships; }

				return [];
			});
		};

		const seedGithub = (memberships: unknown[], publicOrgs: unknown[] = []) => {
			nock('https://api.github.com').get('/user/123456').reply(200, { login: 'new-username' });
			nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, memberships);
			nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, publicOrgs);
		};

		const sync = () => request(app).post('/').send({ userId: 'directus-id' });

		const createdMemberships = () => itemsCreateOne.args.map(args => args[0]).filter((payload: any) => payload.user);

		const createdOrgs = () => itemsCreateOne.args.map(args => args[0]).filter((payload: any) => payload.github_id);

		it('should create the org and the membership for a new org', async () => {
			seedDirectus({});
			seedGithub([{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			const res = await sync();
			expect(res.status).to.equal(200);

			expect(createdOrgs()[0]).to.deep.include({ name: 'jsdelivr', github_id: '1' });
			expect(createdMemberships()[0]).to.deep.equal({ org: 'created-id', user: 'directus-id', role: 'admin' });
		});

		it('should promote a member to admin', async () => {
			seedDirectus({
				orgs: [{ id: 'org-1', name: 'jsdelivr', github_id: '1' }],
				memberships: [{ id: 'membership-1', role: 'member', org: { github_id: '1' } }],
			});

			seedGithub([{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			expect((await sync()).status).to.equal(200);

			expect(itemsUpdateOne.args[0]).to.deep.equal([ 'membership-1', { role: 'admin' }]);
			expect(itemsCreateOne.callCount).to.equal(0);
		});

		it('should never demote an admin', async () => {
			seedDirectus({
				orgs: [{ id: 'org-1', name: 'jsdelivr', github_id: '1' }],
				memberships: [{ id: 'membership-1', role: 'admin', org: { github_id: '1' } }],
			});

			seedGithub([{ state: 'active', role: 'member', organization: { id: 1, login: 'jsdelivr' } }]);

			expect((await sync()).status).to.equal(200);

			expect(itemsUpdateOne.callCount).to.equal(0);
			expect(itemsCreateOne.callCount).to.equal(0);
		});

		it('should remove a membership that is gone from GitHub', async () => {
			seedDirectus({
				orgs: [{ id: 'org-1', name: 'jsdelivr', github_id: '1' }],
				memberships: [
					{ id: 'membership-1', role: 'member', org: { github_id: '1' } },
					{ id: 'membership-2', role: 'admin', org: { github_id: '2' } },
				],
			});

			seedGithub([{ state: 'active', role: 'member', organization: { id: 1, login: 'jsdelivr' } }]);

			expect((await sync()).status).to.equal(200);

			expect(deleteMany.args[0]).to.deep.equal([ [ 'membership-2' ] ]);
		});

		it('should add an org that only the public list shows as a member', async () => {
			// An org restricting our OAuth app is missing from the memberships list, so it comes without a role.
			seedDirectus({});
			seedGithub([], [{ id: 5, login: 'restricted-org' }]);

			const res = await sync();
			expect(res.status).to.equal(200);

			expect(createdOrgs()[0]).to.deep.include({ name: 'restricted-org', github_id: '5' });
			expect(createdMemberships()[0]).to.deep.equal({ org: 'created-id', user: 'directus-id', role: 'member' });
			expect(res.body.github_organizations).to.deep.equal([ 'restricted-org' ]);
		});

		it('should prefer the membership role over the public list', async () => {
			seedDirectus({});

			seedGithub(
				[{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }],
				[{ id: 1, login: 'jsdelivr' }],
			);

			expect((await sync()).status).to.equal(200);

			expect(createdMemberships()).to.deep.equal([{ org: 'created-id', user: 'directus-id', role: 'admin' }]);
		});

		it('should ignore a membership that is not active', async () => {
			seedDirectus({});
			seedGithub([{ state: 'pending', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			const res = await sync();
			expect(res.status).to.equal(200);

			expect(itemsCreateOne.callCount).to.equal(0);
			expect(res.body.github_organizations).to.deep.equal([]);
		});

		it('should treat a billing manager as a member', async () => {
			seedDirectus({});
			seedGithub([{ state: 'active', role: 'billing_manager', organization: { id: 1, login: 'jsdelivr' } }]);

			expect((await sync()).status).to.equal(200);

			expect(createdMemberships()[0]).to.deep.equal({ org: 'created-id', user: 'directus-id', role: 'member' });
		});

		it('should update the org name when it changed on GitHub', async () => {
			seedDirectus({
				orgs: [{ id: 'org-1', name: 'old-name', github_id: '1' }],
				memberships: [{ id: 'membership-1', role: 'admin', org: { github_id: '1' } }],
			});

			seedGithub([{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			expect((await sync()).status).to.equal(200);

			expect(itemsUpdateOne.args[0]).to.deep.equal([ 'org-1', { name: 'jsdelivr' }]);
		});
	});

	it('should fail without updating anything if the username request is rejected', async () => {
		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-github-token')
			.get('/user/123456')
			.reply(401);

		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Failed to get the GitHub data (401). Please sign out and sign in again.');
		expect(updateOne.callCount).to.equal(0);
	});

	it('should fail without updating anything if the user token is rejected', async () => {
		nock('https://api.github.com').get('/user/123456').reply(200, {
			login: 'new-username',
		});

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-github-token')
			.get('/user/memberships/orgs?per_page=100&page=1')
			.reply(401);

		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Failed to get the GitHub data (401). Please sign out and sign in again.');
		expect(updateOne.callCount).to.equal(0);
	});

	it('should fail without updating anything if the user has no token', async () => {
		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: null,
		});

		nock('https://api.github.com').get('/user/123456').reply(401);
		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(401);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(401);

		const res = await request(app).post('/').send({
			userId: 'directus-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Failed to get the GitHub data (401). Please sign out and sign in again.');
		expect(updateOne.callCount).to.equal(0);
	});

	it('should not call update if data is the same', async () => {
		nock('https://api.github.com').get('/user/123456').reply(200, {
			login: 'old-username',
		});

		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'old-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

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

	it('should deprecate an invalid default_prefix and notify the user', async () => {
		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: 'user-github-token',
			default_prefix: 'old-username',
			deprecated_prefix: null,
			public_probes: true,
		});

		nock('https://api.github.com').get('/user/123456').reply(200, { login: 'new-username' });
		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({ userId: 'directus-id' });

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(updateOne.callCount).to.equal(2);

		expect(updateOne.args[0]).to.deep.equal([ 'directus-id', {
			github_username: 'new-username',
			github_organizations: [ 'new-org' ],
		}]);

		expect(updateOne.args[1]).to.deep.equal([ 'directus-id', {
			default_prefix: 'new-username',
			deprecated_prefix: 'old-username',
		}, { emitEvents: false }]);

		expect(updateByQuery.args[0]).to.deep.equal([
			{ filter: { deprecated_prefix: { _eq: 'new-username' } } },
			{ deprecated_prefix: null },
		]);

		expect(createNotification.callCount).to.equal(1);

		expect(createNotification.args[0]?.[0]).to.include({
			recipient: 'directus-id',
			type: 'default_tag_change',
		});

		expect(createNotification.args[0]?.[0].message).to.include('default-tag/confirm');
	});

	it('should update an invalid default_prefix without moving it to deprecated_prefix for `public_probes: false`', async () => {
		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: 'user-github-token',
			default_prefix: 'old-username',
			deprecated_prefix: null,
			public_probes: false,
		});

		nock('https://api.github.com').get('/user/123456').reply(200, { login: 'new-username' });
		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'new-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({ userId: 'directus-id' });

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(updateOne.callCount).to.equal(2);

		expect(updateByQuery.args[0]).to.deep.equal([
			{ filter: { deprecated_prefix: { _eq: 'new-username' } } },
			{ deprecated_prefix: null },
		]);

		expect(updateOne.args[1]).to.deep.equal([ 'directus-id', {
			default_prefix: 'new-username',
		}, { emitEvents: false }]);

		expect(createNotification.callCount).to.equal(0);
	});

	it('should not deprecate when default_prefix is still valid', async () => {
		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'old-org' ],
			github_oauth_token: 'user-github-token',
			default_prefix: 'old-username',
			deprecated_prefix: null,
		});

		nock('https://api.github.com').get('/user/123456').reply(200, { login: 'old-username' });
		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'old-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({ userId: 'directus-id' });

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);
		expect(updateOne.callCount).to.equal(0);
		expect(createNotification.callCount).to.equal(0);
	});

	it('should not deprecate when default_prefix is an unchanged org and only the username changed', async () => {
		readOne.resolves({
			id: 'directus-id',
			external_identifier: '123456',
			github_username: 'old-username',
			github_organizations: [ 'my-org' ],
			github_oauth_token: 'user-github-token',
			default_prefix: 'my-org',
			deprecated_prefix: null,
		});

		nock('https://api.github.com').get('/user/123456').reply(200, { login: 'new-username' });
		nock('https://api.github.com').get('/user/memberships/orgs?per_page=100&page=1').reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'my-org' } }]);
		nock('https://api.github.com').get('/user/123456/orgs?per_page=100&page=1').reply(200, []);

		const res = await request(app).post('/').send({ userId: 'directus-id' });

		expect(nock.isDone()).to.equal(true);
		expect(res.status).to.equal(200);

		expect(updateOne.callCount).to.equal(1);

		expect(updateOne.args[0]).to.deep.equal([ 'directus-id', {
			github_username: 'new-username',
			github_organizations: [ 'my-org' ],
		}]);

		expect(updateByQuery.callCount).to.equal(0);
		expect(createNotification.callCount).to.equal(0);
	});

	it('should confirm the prefix update and clear deprecated_prefix', async () => {
		const link = getLinkGenerator(endpointContext).generateDefaultTagChangeLink('directus-id');
		const data = new URL(link).searchParams.get('data')!;

		const res = await request(app).post('/default-tag/confirm').query({ data });

		expect(res.status).to.equal(200);
		expect(updateOne.args[0]).to.deep.equal([ 'directus-id', { deprecated_prefix: null }]);
	});

	it('should reject an invalid confirmation token', async () => {
		const res = await request(app).post('/default-tag/confirm').query({ data: 'not-a-valid-token' });

		expect(res.status).to.equal(400);
		expect(updateOne.callCount).to.equal(0);
	});

	it('should reject a confirmation request without a token', async () => {
		const res = await request(app).post('/default-tag/confirm');

		expect(res.status).to.equal(400);
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
