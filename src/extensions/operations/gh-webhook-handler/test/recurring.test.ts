import { expect } from 'chai';
import * as sinon from 'sinon';
import { OperationContext } from '@directus/types';
import _ from 'lodash';
import operationApi from '../src/api.js';
import recurringSponsorshipCreated from './recurring-sponsorship-created.json' assert { type: 'json' };
import recurringSponsorshipTierChanged from './recurring-sponsorship-tier-changed.json' assert { type: 'json' };

describe('GitHub webhook recurring handler', () => {
	const database = {} as OperationContext['database'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
		CREDITS_PER_DOLLAR: '10000',
	};
	const creditsCreateOne = sinon.stub().resolves(1);
	const sponsorsCreateOne = sinon.stub().resolves(2);
	const sponsorsUpdateByQuery = sinon.stub().resolves(2);
	const services = {
		ItemsService: sinon.stub().callsFake((collection) => {
			switch (collection) {
				case 'gp_credits_additions':
					return { createOne: creditsCreateOne };
				case 'sponsors':
					return { createOne: sponsorsCreateOne, updateByQuery: sponsorsUpdateByQuery };
				default:
					throw new Error('Collection name wasn\'t provided');
			}
		}),
	};

	before(() => {
		sinon.useFakeTimers(new Date('2023-09-19T00:00:00.000Z'));
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	it('should handle valid recurring sponsorship', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=5715395b41f79dfc4850a380297bb9fa7addf83d969cb712f9a053ae190f2e17',
				},
				body: recurringSponsorshipCreated,
			},
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'gp_credits_additions', {
			schema: {},
			knex: {},
		}]);

		expect(creditsCreateOne.callCount).to.equal(1);

		expect(creditsCreateOne.args[0]).to.deep.equal([{
			github_id: '2',
			amount: 150000,
			comment: 'For 15$ sponsorship',
		}]);

		expect(sponsorsCreateOne.callCount).to.equal(1);

		expect(sponsorsCreateOne.args[0]).to.deep.equal([{
			github_login: 'monalisa',
			github_id: '2',
			monthly_amount: 15,
			last_earning_date: '2023-09-19T00:00:00.000Z',
		}]);

		expect(result).to.equal('Sponsor with id: 2 created. Credits item with id: 1 created. Recurring sponsorship handled.');
	});

	it('should handle tier change to the upper amount', async () => {
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=0b00755e53add3b61b5be9c5d2a237b59a9f6c9494721d46eae31f8fea06fdb9',
				},
				body: recurringSponsorshipTierChanged,
			},
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'gp_credits_additions', {
			schema: {},
			knex: {},
		}]);

		expect(sponsorsUpdateByQuery.callCount).to.equal(1);

		expect(sponsorsUpdateByQuery.args[0]).to.deep.equal([{
			filter: {
				github_id: '2',
			},
		}, {
			monthly_amount: 15,
		},
		]);

		expect(creditsCreateOne.callCount).to.equal(1);

		expect(creditsCreateOne.args[0]).to.deep.equal([{
			github_id: '2',
			amount: 50000,
			comment: 'For 5$ sponsorship',
		}]);

		expect(result).to.equal('Sponsor with id: 2 updated. Credits item with id: 1 created.');
	});

	it('should handle tier change to the lower amount', async () => {
		const body = _.cloneDeep(recurringSponsorshipTierChanged);
		body.sponsorship.tier.monthly_price_in_dollars = 5;
		const data = {
			$trigger: {
				headers: {
					'x-hub-signature-256': 'sha256=cf9000279263c1e48b30afe5052317a830c102c268580983fadaa3a4bb21e7b1',
				},
				body,
			},
		};

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(sponsorsUpdateByQuery.callCount).to.equal(1);

		expect(sponsorsUpdateByQuery.args[0]).to.deep.equal([{
			filter: {
				github_id: '2',
			},
		}, {
			monthly_amount: 5,
		},
		]);

		expect(result).to.equal('Sponsor with id: 2 updated.');
	});
});
