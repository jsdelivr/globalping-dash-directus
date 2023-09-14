import crypto from 'node:crypto';
import { defineOperationApi } from '@directus/extensions-sdk';
import { OperationContext } from '@directus/types';

const CREDITS_PER_DOLLAR = 10_000;

type Data = {
	$trigger: {
		headers: {
			'x-hub-signature-256'?: string;
		},
		body: {
			action: 'created',
			sponsorship: {
				sponsor?: {
					login: string;
					id: number;
				},
				tier: {
					created_at: string;
					monthly_price_in_dollars: number;
					is_one_time: boolean;
				}
			}
		}
	}
};

type ValidateGithubSignatureArgs = {
	headers: Data['$trigger']['headers'],
	body: Data['$trigger']['body'],
	env: OperationContext['env']
};
const validateGithubSignature = ({ headers, body, env }: ValidateGithubSignatureArgs) => {
	const GITHUB_WEBHOOK_TOKEN = env['GITHUB_WEBHOOK_TOKEN'] as string | undefined;
	const githubSignature = headers['x-hub-signature-256'];

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

type AddItemArgs = {
	services: OperationContext['services'],
	database: OperationContext['database'],
	getSchema: OperationContext['getSchema'],
	body: Data['$trigger']['body']
};
const addCredits = async ({ services, database, getSchema, body }: AddItemArgs) => {
	const { ItemsService } = services;

	const creditsService = new ItemsService('credits', {
		schema: await getSchema({ database }),
		knex: database,
	});

	if (!body?.sponsorship?.sponsor) {
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor}`);
	}

	const payload = {
		githubLogin: body.sponsorship.sponsor.login,
		githubId: body.sponsorship.sponsor.id,
		amount: body.sponsorship.tier.monthly_price_in_dollars,
		credits: body.sponsorship.tier.monthly_price_in_dollars * CREDITS_PER_DOLLAR
	};

	const result = await creditsService.createOne(payload);
	return result;
};

const addSponsor = async ({ services, database, getSchema, body }: AddItemArgs) => {
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	if (!body?.sponsorship?.sponsor) {
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor}`);
	}

	const payload = {
		githubLogin: body.sponsorship.sponsor.login,
		githubId: body.sponsorship.sponsor.id,
		monthlyAmount: body.sponsorship.tier.monthly_price_in_dollars,
		lastEarningDate: body.sponsorship.tier.created_at
	};

	const result = await sponsorsService.createOne(payload);
	return result;
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

		const creditsId = await addCredits({ services, database, getSchema, body });

		if (body.sponsorship.tier.is_one_time) {
			return `Credits item with id: ${creditsId} created. One-time sponsorship handled.`;
		} else {
			const sponsorId = await addSponsor({ services, database, getSchema, body });
			return `Sponsor with id: ${sponsorId} created. Credits item with id: ${creditsId} created. Recurring sponsorship handled.`
		}
	},
});
