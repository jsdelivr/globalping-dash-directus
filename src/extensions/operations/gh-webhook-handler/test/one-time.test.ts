import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { SOURCE_ID_TO_TARGET_ID } from '../../../lib/src/add-credits.js';
import operationApi from '../src/api.js';
import oneTimeSponsorshipCreated from './one-time-sonsorship-created.json' assert { type: 'json' };

describe('GitHub webhook one-time handler', () => {
	const database = {} as OperationContext['database'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
		CREDITS_PER_DOLLAR: '10000',
		CREDITS_BONUS_PER_100_DOLLARS: '5',
		MAX_CREDITS_BONUS: '1500',
	};
	const createOne = sinon.stub().resolves(1);
	const readByQuery = sinon.stub().resolves([]);
	const services = {
		ItemsService: sinon.stub().returns({ createOne, readByQuery }),
	};

	beforeEach(() => {
		sinon.resetHistory();
		readByQuery.resolves([]);
		delete SOURCE_ID_TO_TARGET_ID[2];
	});

	it('should handle valid one-time sponsorship', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b',
				},
				body: oneTimeSponsorshipCreated,
			},
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			github_id: '2',
			amount: 50000,
			reason: 'one_time_sponsorship',
			meta: {
				amountInDollars: 5,
				bonus: 0,
			},
		}]);

		expect(result).to.equal('Credits item with id: 1 created. One-time sponsorship handled.');
	});

	it('should handle valid one-time sponsorship with bonus', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b',
				},
				body: oneTimeSponsorshipCreated,
			},
		};

		readByQuery.resolves([{ // 494 already donated + 5 incoming donation = 499
			meta: { amountInDollars: 100, bonus: 5 },
		}, {
			meta: { amountInDollars: 200, bonus: 15 },
		}, {
			meta: { amountInDollars: 50, bonus: 15 },
		}, {
			meta: { amountInDollars: 50, bonus: 20 },
		}, {
			meta: { amountInDollars: 94, bonus: 20 },
		}]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			github_id: '2',
			amount: 60000,
			reason: 'one_time_sponsorship',
			meta: {
				amountInDollars: 5,
				bonus: 20,
			},
		}]);

		expect(result).to.equal('Credits item with id: 1 created. One-time sponsorship handled.');
	});

	it('should redirect credits to another GitHub id if specified', async () => {
		SOURCE_ID_TO_TARGET_ID[2] = '3';

		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b',
				},
				body: oneTimeSponsorshipCreated,
			},
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			github_id: '3',
			amount: 50000,
			reason: 'one_time_sponsorship',
			meta: {
				amountInDollars: 5,
				bonus: 0,
			},
		}]);

		expect(result).to.equal('Credits item with id: 1 created. One-time sponsorship handled.');
	});

	it('should throw without GITHUB_WEBHOOK_SECRET env', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b',
				},
				body: oneTimeSponsorshipCreated,
			},
		};
		const env = {};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('GITHUB_WEBHOOK_SECRET was not provided'));
		expect(createOne.callCount).to.equal(0);
	});

	it('should throw without x-hub-signature-256 header', async () => {
		const data = {
			$trigger: {
				headers: {},
				body: oneTimeSponsorshipCreated,
			},
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('"x-hub-signature-256" header was not provided'));
		expect(services.ItemsService.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
	});

	it('should throw with wrong x-hub-signature-256 header', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=wrongSignatureValueWrongSignatureValueWrongSignatureValueWrongSi',
				},
				body: oneTimeSponsorshipCreated,
			},
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('Signature is not valid'));
		expect(services.ItemsService.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
	});

	it('should throw without sponsor field in sponsorship object', async () => {
		const { action, sponsorship, sender } = oneTimeSponsorshipCreated;
		const { sponsor, ...otherSponsorshipFields } = sponsorship;

		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=d58d9027d97211d8378194a43ca5ca2c6ee3ed5e7afcdabb2ce373048f9f9acc',
				},
				body: {
					action,
					sender,
					sponsorship: {
						...otherSponsorshipFields,
					},
				},
			},
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('"sponsorship.sponsor" field is undefined'));
		expect(createOne.callCount).to.equal(0);
	});
});
