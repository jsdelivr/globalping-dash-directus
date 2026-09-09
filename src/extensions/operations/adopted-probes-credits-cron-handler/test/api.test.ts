import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import operationApi from '../src/api.js';

describe('Adopted probes status cron handler', () => {
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		CREDITS_PER_ADOPTED_PROBE_DAY: '100',
		ADOPTED_PROBES_REQUIRED_ONLINE_TIMES: '120',
	};

	const data = {};
	const rawStub = sinon.stub();
	const database = { raw: rawStub } as unknown as OperationContext['database'];
	const createMany = sinon.stub();
	const updateByQuery = sinon.stub();
	const services = {
		ItemsService: sinon.stub().returns({ createMany, updateByQuery }),
	} as unknown as OperationContext['services'];
	let sandbox: sinon.SinonSandbox;


	before(() => {
		sandbox = sinon.createSandbox({ useFakeTimers: true });
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	after(() => {
		sandbox.restore();
	});

	it('should assign credits for >20 hours online and reset online hours', async () => {
		rawStub.resolves([ [{
			id: '1',
			ip: '1.2.3.4',
			githubId: '123456',
			onlineTimesToday: 120,
		}] ]);

		createMany.resolves([ 1 ]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(createMany.args[0]).to.deep.equal([
			[
				{
					github_id: '123456',
					amount: 100,
					reason: 'adopted_probe',
					meta: {
						id: '1',
						ip: '1.2.3.4',
						name: null,
					},
					adopted_probe: '1',
				},
			],
		]);

		expect(updateByQuery.args[0]).to.deep.equal([{}, { onlineTimesToday: 0 }, { emitEvents: false }]);
		expect(result).to.equal('Created credits with ids: 1');
	});

	it('should not assign credits for <20 hours online and still reset online hours', async () => {
		rawStub.resolves([ [{
			id: '1',
			ip: '1.2.3.4',
			githubId: '123456',
			onlineTimesToday: 119,
		}] ]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(createMany.callCount).to.equal(0);
		expect(createMany.callCount).to.equal(0);
		expect(updateByQuery.args[0]).to.deep.equal([{}, { onlineTimesToday: 0 }, { emitEvents: false }]);

		expect(result).to.equal('No credits created');
	});

	it('should throw an error if CREDITS_PER_ADOPTED_PROBE_DAY was not provided', async () => {
		const env = {
			ADOPTED_PROBES_REQUIRED_ONLINE_TIMES: '120',
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('CREDITS_PER_ADOPTED_PROBE_DAY was not provided'));
	});

	it('should throw an error if ADOPTED_PROBES_REQUIRED_ONLINE_TIMES was not provided', async () => {
		const env = {
			CREDITS_PER_ADOPTED_PROBE_DAY: '100',
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('ADOPTED_PROBES_REQUIRED_ONLINE_TIMES was not provided'));
	});
});
