import { OperationContext } from '@directus/types';
import { addCredits } from '../repositories/credits.js';
import { addSponsor } from '../repositories/sponsors.js';
import { Data } from '../types.js';

type CreatedActionArgs = {
	services: OperationContext['services'],
	database: OperationContext['database'],
	getSchema: OperationContext['getSchema'],
	env: OperationContext['env'],
	body: Data['$trigger']['body']
};

export const createdAction = async ({ body, services, database, getSchema, env }: CreatedActionArgs) => {
	if (!body?.sponsorship?.sponsor) {
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor?.toString()}`);
	}

	if (body.sponsorship.tier.is_one_time) {
		const creditsId = await addCredits({
			github_id: body.sponsorship.sponsor.id.toString(),
			amount: body.sponsorship.tier.monthly_price_in_dollars,
		}, {
			services,
			database,
			getSchema,
			env,
		});
		return `Credits item with id: ${creditsId} created. One-time sponsorship handled.`;
	}

	const sponsorId = await addSponsor({
		github_login: body.sponsorship.sponsor.login,
		github_id: body.sponsorship.sponsor.id.toString(),
		monthly_amount: body.sponsorship.tier.monthly_price_in_dollars,
		last_earning_date: new Date().toISOString(),
	}, { services, database, getSchema });
	const creditsId = await addCredits({
		github_id: body.sponsorship.sponsor.id.toString(),
		amount: body.sponsorship.tier.monthly_price_in_dollars,
	}, { services, database, getSchema, env });
	return `Sponsor with id: ${sponsorId} created. Credits item with id: ${creditsId} created. Recurring sponsorship handled.`;
};
