import crypto from 'node:crypto';
import { defineOperationApi } from '@directus/extensions-sdk';
import { ApiExtensionContext } from '@directus/types';

type ValidateGithubSignatureArgs = {
	headers: Record<string, unknown>,
	body: Record<string, unknown>,
	env: ApiExtensionContext['env']
};
const validateGithubSignature = ({ headers, body, env }: ValidateGithubSignatureArgs) => {
	const GITHUB_WEBHOOK_TOKEN = env['GITHUB_WEBHOOK_TOKEN'] as string | undefined;
	const githubSignature = headers['x-hub-signature-256'] as string | undefined;

	if (!GITHUB_WEBHOOK_TOKEN) {
		throw new Error('GITHUB_WEBHOOK_TOKEN was not provided');
	}

	if (!githubSignature) {
		throw new Error('"x-hub-signature-256" header was not provided');
	}

	const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_TOKEN);
	const computedSignature = 'sha256=' + hmac.update(JSON.stringify(body), 'utf-8').digest('hex');
	const isGithubSignatureValid = crypto.timingSafeEqual(Buffer.from(githubSignature), Buffer.from(computedSignature));
	return isGithubSignatureValid;
};

type AddCreditsArgs = {
	services: ApiExtensionContext['services'],
	database: ApiExtensionContext['database'],
	getSchema: ApiExtensionContext['getSchema'],
	body: Record<string, unknown>
};
const addCredits = async ({ services, database, getSchema, body }: AddCreditsArgs) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const sender = body?.sender as Record<string, unknown>;

	if (!sender) {
		throw new Error(`"sender" field is ${sender}`);
	}

	const payload = {
		githubLogin: sender.login,
		githubId: sender.id,
		amount: 1,
		credits: 10
	};

	const result = await itemsService.createOne(payload);
	return result;
};

type Data = {
	$trigger: {
		headers: Record<string, unknown>,
		body: Record<string, unknown>
	}
};

export default defineOperationApi({
	id: 'gh-webhook-handler',
	handler: async ({}, { data, database, env, getSchema, services }) => {
		const { $trigger: { headers, body }} = data as Data;

		if (!headers) {
			throw new Error(`"headers" field is ${headers}`);
		}

		if (!body) {
			throw new Error(`"body" field is ${body}`);
		}

		const isGithubSignatureValid = validateGithubSignature({ headers, body, env });

		if (!isGithubSignatureValid) {
			throw new Error('Signature is not valid');
		}

		const itemId = await addCredits({ services, database, getSchema, body });
		return `Credits item with id: ${itemId} created`;
	},
});
