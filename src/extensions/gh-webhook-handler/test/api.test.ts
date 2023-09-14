import { OperationContext } from '@directus/types';
import { test, expect, mock } from 'bun:test';
import operationApi from '../src/api.js';
import oneTimeSponsorshipCreated from './one-time-sonsorship-created.json';

const database = {} as OperationContext['database'];
const exceptions = {} as OperationContext['exceptions'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = { GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8' };
const createOne = mock(() => 1);
const services = {
	ItemsService: mock(function () { return { createOne }})
};

test('gh-webhook-handler should handle valid one-time sponsorship', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=b5ab444bc909d62e7c25f3c0a324b1be12291f9b17f0e220e3b95a5668c5bfda'
			},
			body: oneTimeSponsorshipCreated
		}
	};

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(1);
	expect(services.ItemsService.mock.calls[0]).toEqual([ "credits", {
		schema: {},
		knex: {}
	}]);
	expect(createOne).toHaveBeenCalledTimes(1);
	expect(createOne.mock.calls[0]).toEqual([{
		githubLogin: "monalisa",
		githubId: 2,
		amount: 5,
		credits: 50000
	}]);
	expect(result).toEqual('Credits item with id: 1 created');
});

test('gh-webhook-handler should throw without GITHUB_WEBHOOK_TOKEN env', async () => {
	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=b5ab444bc909d62e7c25f3c0a324b1be12291f9b17f0e220e3b95a5668c5bfda'
			},
			body: oneTimeSponsorshipCreated
		}
	};
	const env = {};

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability }))
		.toThrow(new Error('GITHUB_WEBHOOK_TOKEN was not provided'));
});

test('gh-webhook-handler should throw without x-hub-signature-256 header', async () => {
	const data = {
		$trigger: {
			headers: {},
			body: oneTimeSponsorshipCreated
		}
	};

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability }))
		.toThrow(new Error('"x-hub-signature-256" header was not provided'));
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

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability }))
		.toThrow(new Error('Signature is not valid'));
});

test('gh-webhook-handler should throw without sponsor field in sponsorship object', async () => {
	const {action, sponsorship, sender} = oneTimeSponsorshipCreated;
	const {sponsor, ...otherSponsorshipFields} = sponsorship;

	const data = {
		$trigger: {
			headers: {
				'x-hub-signature-256': 'sha256=dcf53208a93f23ec31c085f7c99c4142b4227ca2b0e155a571ad80eea399e951'
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

	await expect(async () => await operationApi.handler({}, { data, database, env, getSchema, services, exceptions, logger, accountability }))
		.toThrow(new Error('"sponsorship.sponsor" field is undefined'));
});
