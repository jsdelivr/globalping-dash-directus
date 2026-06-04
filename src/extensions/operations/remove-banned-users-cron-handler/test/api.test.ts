import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import operationApi from '../src/api.js';

describe('Remove banned users CRON handler', () => {
	const data = {};
	const database = {
		transaction: sinon.stub().callsFake(async (cb: (trx: unknown) => Promise<unknown>) => cb({})),
	} as any;
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GITHUB_ACCESS_TOKEN: 'system-github-token',
	};

	const readByQuery = sinon.stub();
	const deleteByQuery = sinon.stub().resolves([]);
	const updateMany = sinon.stub().resolves([ '1' ]);
	const deleteMany = sinon.stub().resolves([ '1' ]);
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery, deleteByQuery }),
		UsersService: sinon.stub().returns({ updateMany, deleteMany }),
	} as any;

	const context = { data, database, env, getSchema, services, logger, accountability };

	const yearAgo = () => new Date(Date.now() - (366 * 24 * 60 * 60 * 1000)).toISOString();

	// Bulk login lookup: each node maps to alias uN; a null node produces a NOT_FOUND error like the real API.
	const nockGithubLogins = (nodes: ({ databaseId: number } | null)[]) => {
		const responseData: Record<string, unknown> = {};
		const errors: unknown[] = [];

		nodes.forEach((node, index) => {
			responseData[`u${index}`] = node;

			if (!node) {
				errors.push({ type: 'NOT_FOUND', message: 'Could not resolve to a User with the login', path: [ `u${index}` ] });
			}
		});

		nock('https://api.github.com').post('/graphql').reply(200, { data: responseData, ...errors.length ? { errors } : {} });
	};

	const nockGithubUserById = (id: string, status: number, body: object = {}) => {
		nock('https://api.github.com').get(`/user/${id}`).reply(status, body);
	};

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	after(() => {
		nock.cleanAll();
	});

	it('should suspend a user that is banned on github and delete its tokens', async () => {
		readByQuery.resolves([{
			id: '1',
			github_username: 'valid_user',
			external_identifier: '1',
			status: 'active',
		}, {
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			status: 'active',
		}]);

		nockGithubLogins([{ databaseId: 1 }, null ]);
		nockGithubUserById('2', 404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.calledOnceWith([ '2' ], sinon.match({ status: 'suspended', suspended_at: sinon.match.string }))).to.equal(true);
		expect(deleteByQuery.calledOnceWithExactly({ filter: { user_created: { _in: [ '2' ] } } })).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: [2]; activated: []; deleted: [].');
	});

	it('should reactivate a suspended user that is back on github', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'restored_user',
			external_identifier: '2',
			status: 'suspended',
			suspended_at: new Date().toISOString(),
		}]);

		nockGithubLogins([{ databaseId: 2 }]);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.calledOnceWithExactly([ '2' ], { status: 'active', suspended_at: null })).to.equal(true);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: [2]; deleted: [].');
	});

	it('should delete a user suspended for more than a year', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			status: 'suspended',
			suspended_at: yearAgo(),
		}]);

		nockGithubLogins([ null ]);
		nockGithubUserById('2', 404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(deleteMany.calledOnceWithExactly([ '2' ])).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [2].');
	});

	it('should keep a recently suspended user untouched', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			status: 'suspended',
			suspended_at: new Date().toISOString(),
		}]);

		nockGithubLogins([ null ]);
		nockGithubUserById('2', 404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should not suspend a user who only changed their github username', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'old_name',
			external_identifier: '2',
			status: 'active',
		}]);

		// Old login no longer resolves, but the user still exists under the same id.
		nockGithubLogins([ null ]);
		nockGithubUserById('2', 200, { login: 'new_name' });

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should not suspend a user whose old login was reused by another account', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'reused_name',
			external_identifier: '2',
			status: 'active',
		}]);

		// The login resolves, but to a different account, so it must be confirmed by id.
		nockGithubLogins([{ databaseId: 999 }]);
		nockGithubUserById('2', 200, { login: 'new_name' });

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should do nothing if all users are found', async () => {
		readByQuery.resolves([{
			id: '1',
			github_username: 'valid_user',
			external_identifier: '1',
			status: 'active',
		}, {
			id: '2',
			github_username: 'valid_user_2',
			external_identifier: '2',
			status: 'active',
		}]);

		nockGithubLogins([{ databaseId: 1 }, { databaseId: 2 }]);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should ignore seeded users', async () => {
		readByQuery.resolves([{
			id: '1',
			github_username: 'seeded_user',
			external_identifier: '1234567890',
			status: 'active',
		}]);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should do nothing if user doesn\'t have external_identifier', async () => {
		readByQuery.resolves([{
			id: '1',
			github_username: 'no_identifier_user',
			external_identifier: null,
			status: 'active',
		}]);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(deleteMany.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});
});
