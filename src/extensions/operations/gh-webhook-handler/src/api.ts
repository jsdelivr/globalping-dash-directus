import crypto from 'node:crypto';
import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import { createdAction } from './actions/created.js';
import { tierChangedAction } from './actions/tier-changed.js';
import type { Data } from './types.js';

type ValidateGithubSignatureArgs = {
	headers: Data['$trigger']['headers'],
	body: Data['$trigger']['body'],
	env: OperationContext['env']
};

const validateGithubSignature = ({ headers, body, env }: ValidateGithubSignatureArgs) => {
	const GITHUB_WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET as string | undefined;
	const githubSignature = headers['x-hub-signature-256'];

	if (!GITHUB_WEBHOOK_SECRET) {
		throw new Error('GITHUB_WEBHOOK_SECRET was not provided');
	}

	if (!githubSignature) {
		throw new Error('"x-hub-signature-256" header was not provided');
	}

	const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
	const computedSignature = 'sha256=' + hmac.update(JSON.stringify(body), 'utf-8').digest('hex');
	const isGithubSignatureValid = crypto.timingSafeEqual(Buffer.from(githubSignature), Buffer.from(computedSignature));
	return isGithubSignatureValid;
};

export default defineOperationApi({
	id: 'gh-webhook-handler',
	handler: async (_operationData, { data, database, env, getSchema, services }) => {
		const { $trigger: { headers, body } } = data as {$trigger: Partial<Data['$trigger']>};

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

		if (body.action === 'created') {
			return createdAction({ body, services, database, getSchema, env });
		} else if (body.action === 'tier_changed') {
			return tierChangedAction({ body, services, database, getSchema, env });
		}

		return `Handler for action: ${body.action} is not defined`;
	},
});
