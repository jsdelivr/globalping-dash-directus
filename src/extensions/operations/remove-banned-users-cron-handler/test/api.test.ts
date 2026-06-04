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
		GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	};

	const readByQuery = sinon.stub();
	const deleteByQuery = sinon.stub().resolves([]);
	const updateOne = sinon.stub().resolves('1');
	const deleteOne = sinon.stub().resolves('1');
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery, deleteByQuery }),
		UsersService: sinon.stub().returns({ updateOne, deleteOne }),
	} as any;

	const context = { data, database, env, getSchema, services, logger, accountability };

	const yearAgo = () => new Date(Date.now() - (366 * 24 * 60 * 60 * 1000)).toISOString();

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
			github_oauth_token: 'user-1-github-token',
			status: 'active',
		}, {
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			github_oauth_token: 'user-2-github-token',
			status: 'active',
		}]);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-1-github-token')
			.get('/user/1').reply(200, { login: 'valid_user' });

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-2-github-token')
			.get('/user/2').reply(404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateOne.calledOnceWithExactly('2', { status: 'suspended' })).to.equal(true);
		expect(deleteByQuery.calledOnceWithExactly({ filter: { user_created: { _eq: '2' } } })).to.equal(true);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: [2]; activated: []; deleted: [].');
	});

	it('should reactivate a suspended user that is back on github', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'restored_user',
			external_identifier: '2',
			github_oauth_token: 'user-2-github-token',
			status: 'suspended',
			date_updated: new Date().toISOString(),
		}]);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-2-github-token')
			.get('/user/2').reply(200, { login: 'restored_user' });

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateOne.calledOnceWithExactly('2', { status: 'active' })).to.equal(true);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: [2]; deleted: [].');
	});

	it('should delete a user suspended for more than a year', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			github_oauth_token: 'user-2-github-token',
			status: 'suspended',
			date_updated: yearAgo(),
		}]);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-2-github-token')
			.get('/user/2').reply(404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(deleteOne.calledOnceWithExactly('2')).to.equal(true);
		expect(updateOne.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [2].');
	});

	it('should keep a recently suspended user untouched', async () => {
		readByQuery.resolves([{
			id: '2',
			github_username: 'banned_user',
			external_identifier: '2',
			github_oauth_token: 'user-2-github-token',
			status: 'suspended',
			date_updated: new Date().toISOString(),
		}]);

		nock('https://api.github.com')
			.matchHeader('Authorization', 'Bearer user-2-github-token')
			.get('/user/2').reply(404);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(0);
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

		nock('https://api.github.com').get('/user/1').reply(200, { login: 'valid_user' });
		nock('https://api.github.com').get('/user/2').reply(200, { login: 'valid_user_2' });

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});

	it('should ignore seeded users and users without external_identifier', async () => {
		readByQuery.resolves([{
			id: '1',
			github_username: 'seeded_user',
			external_identifier: '1234567890',
			status: 'active',
		}, {
			id: '2',
			github_username: 'no_identifier_user',
			external_identifier: null,
			status: 'active',
		}]);

		const result = await operationApi.handler({}, context);

		expect(nock.isDone()).to.equal(true);
		expect(updateOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('Users suspended: []; activated: []; deleted: [].');
	});
});
