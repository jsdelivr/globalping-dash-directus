import { OperationContext } from '@directus/types';
import { test, expect, mock, beforeEach } from 'bun:test';
import operationApi from '../src/api.js';
import oneTimeSponsorshipCreated from './one-time-sonsorship-created.json';

const database = {} as OperationContext['database'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = {
	GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	CREDITS_PER_DOLLAR: '10000'
};
const createOne = mock(() => Promise.resolve(1));
const services = {
	ItemsService: mock(function () { return { createOne }}),
};

beforeEach(() => {
	createOne.mockClear();
	services.ItemsService.mockClear();
});

test('gh-webhook-handler should handle valid one-time sponsorship', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b'
			},
			body: oneTimeSponsorshipCreated
		}
	};

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(1);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'credits', {
		schema: {},
		knex: {}
	}]);
	expect(createOne).toHaveBeenCalledTimes(1);
	expect(createOne.mock.calls[0]).toEqual([{
		githubLogin: 'monalisa',
		githubId: '2',
		amount: 5,
		credits: 50000
	}]);
	expect(result).toEqual('Credits item with id: 1 created. One-time sponsorship handled.');
});

test('gh-webhook-handler should throw without GITHUB_WEBHOOK_TOKEN env', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=005bb451b83a393675d01ae33e2f778c2c245b4093d46702ad15917717384c9b'
			},
			body: oneTimeSponsorshipCreated
		}
	};
	const env = {};

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }))
		.toThrow(new Error('GITHUB_WEBHOOK_TOKEN was not provided'));
	expect(createOne).toHaveBeenCalledTimes(0);
});

test('gh-webhook-handler should throw without x-hub-signature-256 header', async () => {
	const data = {
		$trigger: {
			headers: {},
			body: oneTimeSponsorshipCreated
		}
	};

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }))
		.toThrow(new Error('"x-hub-signature-256" header was not provided'));
	expect(services.ItemsService).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
});

test('gh-webhook-handler should throw with wrong x-hub-signature-256 header', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=wrongSignatureValueWrongSignatureValueWrongSignatureValueWrongSi'
			},
			body: oneTimeSponsorshipCreated
		}
	};

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }))
		.toThrow(new Error('Signature is not valid'));
	expect(services.ItemsService).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
});

test('gh-webhook-handler should throw without sponsor field in sponsorship object', async () => {
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

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability }))
		.toThrow(new Error('"sponsorship.sponsor" field is undefined'));
	expect(createOne).toHaveBeenCalledTimes(0);
});
