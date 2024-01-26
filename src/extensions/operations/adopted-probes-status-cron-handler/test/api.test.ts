import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import type { OperationContext } from '@directus/extensions';
import { checkOnlineStatus } from '../src/actions/check-online-status.js';

describe('Adopted probes status cron handler', () => {
	const database = {} as OperationContext['database'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GLOBALPING_URL: 'https://api.globalping.io/v1',
		GP_SYSTEM_KEY: 'system',
		ADOPTED_PROBES_CHECK_TIME_MAX_DEVIATION_MINS: '5',
	};

	const data = {};
	const readByQuery = sinon.stub();
	const updateBatch = sinon.stub();
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery, updateBatch }),
	};
	let sandbox: sinon.SinonSandbox;


	before(() => {
		nock.disableNetConnect();
		sandbox = sinon.createSandbox({ useFakeTimers: true });
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	after(() => {
		nock.cleanAll();
		sandbox.restore();
	});

	it('should increment "onlineTimesToday" field if probe is connected to gp', async () => {
		nock('https://api.globalping.io').get('/v1/probes?systemkey=system').reply(200, [{
			ipAddress: '1.2.3.4',
			status: 'ready',
		}]);

		readByQuery.resolves([{
			id: '1',
			ip: '1.2.3.4',
			onlineTimesToday: 0,
		}]);

		updateBatch.resolves([ 1 ]);

		const result = await checkOnlineStatus({ data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).deep.equal([ 'gp_adopted_probes', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'gp_adopted_probes', {
			schema: {},
			knex: {},
		}]);

		expect(updateBatch.args[0]).to.deep.equal([ [{ id: '1', onlineTimesToday: 1 }], { emitEvents: false }]);

		expect(result).to.deep.equal([ 1 ]);
	});

	it('should not call "updateBatch" if adopted probe is not connected to gp', async () => {
		nock('https://api.globalping.io').get('/v1/probes?systemkey=system').reply(200, []);

		readByQuery.resolves([{
			id: '1',
			ip: '1.2.3.4',
			onlineTimesToday: 0,
		}]);

		const result = await checkOnlineStatus({ data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).deep.equal([ 'gp_adopted_probes', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(updateBatch.callCount).to.equal(0);

		expect(result).to.deep.equal([]);
	});

	it('should not call "updateBatch" if probe is connected to gp but not adopted', async () => {
		nock('https://api.globalping.io').get('/v1/probes?systemkey=system').reply(200, [{
			ipAddress: '1.2.3.4',
			status: 'ready',
		}]);

		readByQuery.resolves([]);

		const result = await checkOnlineStatus({ data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).deep.equal([ 'gp_adopted_probes', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(updateBatch.callCount).to.equal(0);

		expect(result).to.deep.equal([]);
	});

	it('should not increment "onlineTimesToday" field if probe status from gp is not "ready"', async () => {
		nock('https://api.globalping.io').get('/v1/probes?systemkey=system').reply(200, [{
			ipAddress: '1.2.3.4',
			status: 'ping-test-failed',
		}]);

		readByQuery.resolves([{
			id: '1',
			ip: '1.2.3.4',
			onlineTimesToday: 0,
		}]);

		const result = await checkOnlineStatus({ data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).deep.equal([ 'gp_adopted_probes', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(updateBatch.callCount).to.equal(0);

		expect(result).to.deep.equal([]);
	});
});
