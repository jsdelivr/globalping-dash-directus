import { expect } from 'chai';
import * as sinon from 'sinon';
import { OperationContext } from '@directus/types';
import operationApi from '../src/api.js';
import oneTimeSponsorshipCreated from './one-time-sonsorship-created.json' assert { type: 'json' };

const database = {} as OperationContext['database'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = {
	GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	CREDITS_PER_DOLLAR: '10000'
};
const createOne = sinon.stub().resolves(1);
const services = {
	ItemsService: sinon.stub().returns({ createOne }),
};

beforeEach(() => {
	sinon.resetHistory();
});

describe('GitHub webhook one-time handler', () => {
	it('should handle valid one-time sponsorship', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b'
				},
				body: oneTimeSponsorshipCreated
			}
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);
		expect(services.ItemsService.args[0]).to.deep.equal([ 'credits', {
			schema: {},
			knex: {}
		}]);
		expect(createOne.callCount).to.equal(1);
		expect(createOne.args[0]).to.deep.equal([{
			githubLogin: 'monalisa',
			githubId: '2',
			credits: 50000,
			comment: 'For 5$ sponsorship'
		}]);
		expect(result).to.equal('Credits item with id: 1 created. One-time sponsorship handled.');
	});

	it('should throw without GITHUB_WEBHOOK_TOKEN env', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b'
				},
				body: oneTimeSponsorshipCreated
			}
		};
		const env = {};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('GITHUB_WEBHOOK_TOKEN was not provided'));
		expect(createOne.callCount).to.equal(0);
	});

	it('should throw without x-hub-signature-256 header', async () => {
		const data = {
			$trigger: {
				headers: {},
				body: oneTimeSponsorshipCreated
			}
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
					'x-hub-signature-256': 'sha256=wrongSignatureValueWrongSignatureValueWrongSignatureValueWrongSi'
				},
				body: oneTimeSponsorshipCreated
			}
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>)
			.catch(err => err);
		expect(err).to.deep.equal(new Error('Signature is not valid'));
		expect(services.ItemsService.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
	});

	it('should throw without sponsor field in sponsorship object', async () => {
		const {action, sponsorship, sender} = oneTimeSponsorshipCreated;
		const {sponsor, ...otherSponsorshipFields} = sponsorship;

		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=d58d9027d97211d8378194a43ca5ca2c6ee3ed5e7afcdabb2ce373048f9f9acc'
				},
				body: {
					action,
					sender,
					sponsorship: {
						...otherSponsorshipFields
					}
				}
			}
		};

		const err = await (operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }) as Promise<string>).catch(err => err);
		expect(err).to.deep.equal(new Error('"sponsorship.sponsor" field is undefined'));
		expect(createOne.callCount).to.equal(0);
	});
});
