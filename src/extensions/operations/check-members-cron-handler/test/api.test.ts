import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import operationApi from '../src/api.js';

type Row = {
	orgId: string;
	orgName: string;
	orgGithubId: string;
	membershipId: string;
	githubId: string | null;
	githubUsername: string | null;
	githubOauthToken: string | null;
};

describe('Check org members CRON handler', () => {
	const data = {};
	const accountability = {} as OperationContext['accountability'];
	const logger = { error: sinon.stub(), warn: sinon.stub() } as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {};

	let rows: Row[] = [];

	// The org query is a knex chain ending with select(columns object); subqueries end with whereNotNull, so only the final
	// object-form select resolves with the rows.
	const query: any = {};

	for (const method of [ 'join', 'whereIn', 'orWhereIn', 'whereNotNull' ]) {
		query[method] = sinon.stub().returns(query);
	}

	query.where = sinon.stub().callsFake((callback: unknown) => {
		if (typeof callback === 'function') {
			callback(query);
		}

		return query;
	});

	query.select = sinon.stub().callsFake((arg: unknown) => typeof arg === 'string' ? query : Promise.resolve(rows));

	const database = sinon.stub().returns(query) as any;

	const deleteMany = sinon.stub().resolves([]);
	const readMany = sinon.stub().resolves([]);
	const updateOne = sinon.stub().resolves();
	const services = {
		ItemsService: sinon.stub().returns({ deleteMany, readMany }),
		UsersService: sinon.stub().returns({ updateOne }),
	} as any;

	const context = { data, database, env, getSchema, services, logger, accountability };

	const org = { orgId: 'org-id', orgName: 'jsdelivr', orgGithubId: '100' };

	const member = (n: number, overrides: Partial<Row> = {}): Row => ({
		...org,
		membershipId: `membership-${n}`,
		githubId: `${n}`,
		githubUsername: `user${n}`,
		githubOauthToken: `token-${n}`,
		...overrides,
	});

	const nockSelfCheck = (token: string, status: number, state = 'active') => {
		nock('https://api.github.com', { reqheaders: { authorization: `Bearer ${token}` } })
			.get(`/user/memberships/orgs/${org.orgName}`)
			.reply(status, { state });
	};

	// Bulk check: nodes keyed by member github id -> list of org github ids, null = NOT_FOUND.
	const nockGraphql = (nodesById: Record<string, string[] | null>) => {
		nock('https://api.github.com').post('/graphql').reply(200, (_uri, body: any) => {
			const responseData: Record<string, unknown> = {};
			const errors: unknown[] = [];

			Object.entries(body.variables as Record<string, string>).forEach(([ variable, login ]) => {
				const alias = variable.replace('l', 'u');
				const githubId = login.replace('user', '');
				const orgIds = nodesById[githubId];

				if (orgIds === null || orgIds === undefined) {
					responseData[alias] = null;
					errors.push({ type: 'NOT_FOUND', message: `Could not resolve to a User with the login of '${login}'.`, path: [ alias ] });
				} else {
					responseData[alias] = { databaseId: Number(githubId), organizations: { nodes: orgIds.map(id => ({ databaseId: Number(id) })) } };
				}
			});

			return { data: responseData, ...errors.length ? { errors } : {} };
		});
	};

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
		deleteMany.resolves([]);
		readMany.resolves([]);
		rows = [];
	});

	afterEach(() => {
		nock.cleanAll();
	});

	after(() => {
		nock.cleanAll();
		nock.enableNetConnect();
	});

	it('should keep all memberships when the bulk check confirms them', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ org.orgGithubId, '555' ] });

		const result = await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Checked 1 orgs. Removed memberships: []. Errors: [].');
	});

	it('should remove the membership of a user who left', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ '555' ] });

		const result = await operationApi.handler({}, context as any);

		expect(deleteMany.callCount).to.equal(1);
		expect(deleteMany.args[0]![0]).to.deep.equal([ 'membership-2' ]);
		expect(result).to.equal('Checked 1 orgs. Removed memberships: [membership-2]. Errors: [].');
	});

	it('should drop the org from the selected orgs of the member who left', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ '555' ] });
		readMany.resolves([{ org: org.orgId, user: { id: 'user-2', selected_orgs: [ org.orgId, 'other-org' ] } }]);

		await operationApi.handler({}, context as any);

		expect(readMany.args[0]).to.deep.equal([ [ 'membership-2' ], { fields: [ 'org', 'user.id', 'user.selected_orgs' ] }]);
		expect(updateOne.args[0]).to.deep.equal([ 'user-2', { selected_orgs: [ 'other-org' ] }, { emitEvents: false }]);
	});

	it('should not touch the selected orgs of a member who did not have the org selected', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ '555' ] });
		readMany.resolves([{ org: org.orgId, user: { id: 'user-2', selected_orgs: [ 'other-org' ] } }]);

		await operationApi.handler({}, context as any);

		expect(deleteMany.callCount).to.equal(1);
		expect(updateOne.callCount).to.equal(0);
	});

	it('should resolve a stale login by the member own token first', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: null });
		nockSelfCheck('token-2', 200);

		await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
	});

	it('should remove a leaver confirmed by his own token', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: null });
		nockSelfCheck('token-2', 404);

		await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.args[0]![0]).to.deep.equal([ 'membership-2' ]);
	});

	it('should fall back to the checker for a stale login with a dead token', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: null });
		nockSelfCheck('token-2', 401);
		nock('https://api.github.com').get('/user/2').reply(200, { login: 'renamed-user' });
		nock('https://api.github.com').get(`/orgs/${org.orgName}/members/renamed-user`).reply(404);

		await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.args[0]![0]).to.deep.equal([ 'membership-2' ]);
	});

	it('should keep a renamed user who is still a member, through the checker', async () => {
		rows = [ member(1), member(2, { githubOauthToken: null }) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: null });
		nock('https://api.github.com').get('/user/2').reply(200, { login: 'renamed-user' });
		nock('https://api.github.com').get(`/orgs/${org.orgName}/members/renamed-user`).reply(204);

		await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
	});

	it('should keep a member whose GitHub account is deleted', async () => {
		rows = [ member(1), member(2, { githubOauthToken: null }) ];
		nockSelfCheck('token-1', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: null });
		nock('https://api.github.com').get('/user/2').reply(404);

		await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
	});

	it('should use a later member as the checker when the first token is dead', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 401);
		nockSelfCheck('token-2', 200);
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ org.orgGithubId ] });

		const result = await operationApi.handler({}, context as any);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Checked 1 orgs. Removed memberships: []. Errors: [].');
	});

	it('should report an error when the org restricts the OAuth app', async () => {
		rows = [ member(1), member(2) ];
		nockSelfCheck('token-1', 403);

		const result = await operationApi.handler({}, context as any);

		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal(`Checked 1 orgs. Removed memberships: []. Errors: [Org jsdelivr restricts the OAuth app, memberships can't be verified.].`);
	});

	it('should report an error when no member has a working token', async () => {
		rows = [ member(1, { githubOauthToken: null }), member(2, { githubOauthToken: null }) ];

		const result = await operationApi.handler({}, context as any);

		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal(`Checked 1 orgs. Removed memberships: []. Errors: [Org jsdelivr has no member with a working token, memberships can't be verified.].`);
	});

	it('should check multiple orgs independently', async () => {
		const otherOrg = { orgId: 'org-2', orgName: 'other-org', orgGithubId: '200' };
		rows = [ member(1), { ...member(2), ...otherOrg }];

		nockSelfCheck('token-1', 200);

		nock('https://api.github.com', { reqheaders: { authorization: 'Bearer token-2' } })
			.get(`/user/memberships/orgs/${otherOrg.orgName}`)
			.reply(200, { state: 'active' });

		// One bulk call per org; the combined map answers correctly for both members whichever org asks first.
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ otherOrg.orgGithubId ] });
		nockGraphql({ 1: [ org.orgGithubId ], 2: [ otherOrg.orgGithubId ] });

		const result = await operationApi.handler({}, context as any);

		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Checked 2 orgs. Removed memberships: []. Errors: [].');
	});
});
