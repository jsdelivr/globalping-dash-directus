import { OperationContext } from '@directus/types';
import { test, expect, mock, beforeEach, beforeAll, setSystemTime } from 'bun:test';
import _ from 'lodash';
import operationApi from '../src/api.js';
import recurringSponsorshipCreated from './recurring-sponsorship-created.json';
import recurringSponsorshipTierChanged from './recurring-sponsorship-tier-changed.json';

const database = {} as OperationContext['database'];
const exceptions = {} as OperationContext['exceptions'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = {
	GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	CREDITS_PER_DOLLAR: '10000'
};
const creditsCreateOne = mock(() => 1);
const sponsorsCreateOne = mock(() => 2);
const sponsorsUpdateByQuery = mock(() => 2);
const services = {
	ItemsService: mock(function (collection) {
		switch (collection) {
			case 'credits':
				return {createOne: creditsCreateOne};
				case 'sponsors':
					return {createOne: sponsorsCreateOne, updateByQuery: sponsorsUpdateByQuery };
			default:
				throw new Error('Collection name wasn\'t provided');
		}
	}),
};

beforeAll(() => {
  setSystemTime(new Date("2023-09-19T00:00:00.000Z"));
});

beforeEach(() => {
	creditsCreateOne.mockClear();
	sponsorsCreateOne.mockClear();
	sponsorsUpdateByQuery.mockClear();
	services.ItemsService.mockClear();
});

test('gh-webhook-handler should handle valid recurring sponsorship', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=5715395b41f79dfc4850a380297bb9fa7addf83d969cb712f9a053ae190f2e17'
			},
			body: recurringSponsorshipCreated
		}
	};

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'credits', {
		schema: {},
		knex: {}
	}]);
	expect(creditsCreateOne).toHaveBeenCalledTimes(1);
	expect(creditsCreateOne.mock.calls[0]).toEqual([{
		githubLogin: 'monalisa',
		githubId: '2',
		amount: 15,
		credits: 150000
	}]);
	expect(sponsorsCreateOne).toHaveBeenCalledTimes(1);
	expect(sponsorsCreateOne.mock.calls[0]).toEqual([{
		githubLogin: 'monalisa',
		githubId: '2',
		monthlyAmount: 15,
		lastEarningDate: '2023-09-19T00:00:00.000Z'
	}]);
	expect(result).toEqual('Sponsor with id: 2 created. Credits item with id: 1 created. Recurring sponsorship handled.');
});

test('gh-webhook-handler should handle tier change to the upper amount', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=0b00755e53add3b61b5be9c5d2a237b59a9f6c9494721d46eae31f8fea06fdb9'
			},
			body: recurringSponsorshipTierChanged
		}
	};

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'credits', {
		schema: {},
		knex: {}
	}]);
	expect(sponsorsUpdateByQuery).toHaveBeenCalledTimes(1);
	expect(sponsorsUpdateByQuery.mock.calls[0]).toEqual([{
			filter: {
				githubId: '2'
			}
		}, {
			monthlyAmount: 15
		}
	]);
	expect(creditsCreateOne).toHaveBeenCalledTimes(1);
	expect(creditsCreateOne.mock.calls[0]).toEqual([{
		githubLogin: 'monalisa',
		githubId: '2',
		amount: 5,
		credits: 50000
	}]);
	expect(result).toEqual('Sponsor with id: 2 updated. Credits item with id: 1 created.');
});

test('gh-webhook-handler should handle tier change to the lower amount', async () => {
	const body = _.cloneDeep(recurringSponsorshipTierChanged);
	body.sponsorship.tier.monthly_price_in_dollars = 5;
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=cf9000279263c1e48b30afe5052317a830c102c268580983fadaa3a4bb21e7b1'
			},
			body
		}
	};

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(1);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(sponsorsUpdateByQuery).toHaveBeenCalledTimes(1);
	expect(sponsorsUpdateByQuery.mock.calls[0]).toEqual([{
			filter: {
				githubId: '2'
			}
		}, {
			monthlyAmount: 5
		}
	]);
	expect(result).toEqual('Sponsor with id: 2 updated.');
});
