import { expect } from 'chai';
import * as sinon from 'sinon';
import { OperationContext } from '@directus/types';
import _ from 'lodash';
import operationApi from '../src/api.js';
import recurringSponsorshipCreated from './recurring-sponsorship-created.json' assert { type: 'json' };
import recurringSponsorshipTierChanged from './recurring-sponsorship-tier-changed.json' assert { type: 'json' };

describe('GitHub webhook recurring handler', () => {
	const database = {
		transaction: async (f) => {
			return f({});
		},
	} as unknown as OperationContext['database'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
		CREDITS_PER_DOLLAR: '10000',
	};
	const usersService = {
		updateByQuery: sinon.stub(),
	};
	const creditsAdditionsService = {
		createOne: sinon.stub().resolves(1),
	};
	const sponsorsService = {
		createOne: sinon.stub().resolves(2),
		updateByQuery: sinon.stub().resolves(2),
	};
	const services = {
		UsersService: sinon.stub().returns(usersService),
		ItemsService: sinon.stub().callsFake((collection) => {
			switch (collection) {
				case 'gp_credits_additions':
					return creditsAdditionsService;
				case 'sponsors':
					return sponsorsService;
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

		expect(services.ItemsService.args[0][0]).to.equal('sponsors');

		expect(services.ItemsService.args[1][0]).to.equal('gp_credits_additions');

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);

		expect(creditsAdditionsService.createOne.args[0]).to.deep.equal([{
			github_id: '2',
			amount: 150000,
			comment: 'For 15$ sponsorship',
		}]);

		expect(sponsorsService.createOne.callCount).to.equal(1);

		expect(sponsorsService.createOne.args[0]).to.deep.equal([{
			github_login: 'monalisa',
			github_id: '2',
			monthly_amount: 15,
			last_earning_date: '2023-09-19T00:00:00.000Z',
		}]);

		expect(usersService.updateByQuery.callCount).to.equal(1);

		expect(usersService.updateByQuery.args[0]).to.deep.equal([
			{
				filter: { external_identifier: '2', user_type: { _neq: 'special' } },
			},
			{ user_type: 'sponsor' },
		]);

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

		expect(services.ItemsService.args[0][0]).to.equal('sponsors');

		expect(services.ItemsService.args[1][0]).to.equal('gp_credits_additions');

		expect(sponsorsService.updateByQuery.callCount).to.equal(1);

		expect(sponsorsService.updateByQuery.args[0]).to.deep.equal([{
			filter: {
				github_id: '2',
			},
		}, {
			monthly_amount: 15,
		},
		]);

		expect(usersService.updateByQuery.callCount).to.equal(0);

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);

		expect(creditsAdditionsService.createOne.args[0]).to.deep.equal([{
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

		expect(services.ItemsService.args[0][0]).to.equal('sponsors');

		expect(sponsorsService.updateByQuery.callCount).to.equal(1);

		expect(sponsorsService.updateByQuery.args[0]).to.deep.equal([{
			filter: {
				github_id: '2',
			},
		}, {
			monthly_amount: 5,
		},
		]);

		expect(usersService.updateByQuery.callCount).to.equal(0);

		expect(result).to.equal('Sponsor with id: 2 updated.');
	});
});
