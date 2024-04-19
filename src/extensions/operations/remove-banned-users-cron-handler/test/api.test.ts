import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import { OperationContext } from '@directus/types';
import operationApi from '../src/api.js';

describe('Remove banned users CRON handler', () => {
	const data = {};
	const database = {} as OperationContext['database'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	};

	const readByQuery = sinon.stub();
	const deleteOne = sinon.stub().resolves(1);
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery }),
		UsersService: sinon.stub().returns({ deleteOne }),
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

	it('should remove users that are deleted on github', async () => {
		readByQuery.resolves([{
			id: 1,
			github_username: 'valid_user',
			external_identifier: 1,
		}, {
			id: 2,
			github_username: 'banned_user',
			external_identifier: 2,
		}]);

		nock('https://api.github.com').get('/user/1').reply(200, {
			login: 'valid_user',
		});

		nock('https://api.github.com').get('/user/2').reply(404);

		deleteOne.resolves([ 2 ]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(nock.isDone()).to.equal(true);
		expect(deleteOne.args[0]).to.deep.equal([ 2 ]);
		expect(result).to.equal('Removed users with ids: 2.');
	});

	it('should do nothing if all users was found', async () => {
		readByQuery.resolves([{
			id: 1,
			github_username: 'valid_user',
			external_identifier: 1,
		}, {
			id: 2,
			github_username: 'valid_user_2',
			external_identifier: 2,
		}]);

		nock('https://api.github.com').get('/user/1').reply(200, {
			login: 'valid_user',
		});

		nock('https://api.github.com').get('/user/2').reply(200, {
			login: 'valid_user_2',
		});


		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(nock.isDone()).to.equal(true);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('No users removed.');
	});

	it('should do nothing if user doesn\'t have external_identifier', async () => {
		readByQuery.resolves([{
			id: 1,
			github_username: 'valid_user',
			external_identifier: null,
		}]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(nock.isDone()).to.equal(true);
		expect(deleteOne.callCount).to.equal(0);
		expect(result).to.equal('No users removed.');
	});
});
