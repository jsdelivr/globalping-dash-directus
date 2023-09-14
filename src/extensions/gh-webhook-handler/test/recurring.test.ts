import { OperationContext } from '@directus/types';
import { test, expect, mock } from 'bun:test';
import operationApi from '../src/api.js';
import recurringSponsorshipCreated from './recurring-sponsorship-created.json';

const database = {} as OperationContext['database'];
const exceptions = {} as OperationContext['exceptions'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = { GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8' };
const creditsCreateOne = mock(() => 1);
const sponsorsCreateOne = mock(() => 2);
const services = {
	ItemsService: mock(function (collection) {
		switch (collection) {
			case 'credits':
				return {createOne: creditsCreateOne};
				case 'sponsors':
					return {createOne: sponsorsCreateOne};
			default:
				throw new Error('Collection name wasn\'t provided');
		}
	}),
};

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
	expect(services.ItemsService.mock.calls[0]).toEqual([ "credits", {
		schema: {},
		knex: {}
	}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ "sponsors", {
		schema: {},
		knex: {}
	}]);
	expect(creditsCreateOne).toHaveBeenCalledTimes(1);
	expect(creditsCreateOne.mock.calls[0]).toEqual([{
		githubLogin: "monalisa",
		githubId: 2,
		amount: 15,
		credits: 150000
	}]);
	expect(sponsorsCreateOne).toHaveBeenCalledTimes(1);
	expect(sponsorsCreateOne.mock.calls[0]).toEqual([{
		githubLogin: "monalisa",
		githubId: 2,
		monthlyAmount: 15,
		lastEarningDate: "2019-12-20T19:17:05Z"
	}]);
	expect(result).toEqual('Sponsor with id: 2 created. Credits item with id: 1 created. Recurring sponsorship handled.');
});
