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
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor}`);
	}

	if (body.sponsorship.tier.is_one_time) {
		const creditsId = await addCredits({
			githubLogin: body.sponsorship.sponsor.login,
			githubId: body.sponsorship.sponsor.id.toString(),
			amount: body.sponsorship.tier.monthly_price_in_dollars,
		}, {
			services,
			database,
			getSchema,
			env
		});
		return `Credits item with id: ${creditsId} created. One-time sponsorship handled.`;
	} else {
		const sponsorId = await addSponsor({
			githubLogin: body.sponsorship.sponsor.login,
			githubId: body.sponsorship.sponsor.id.toString(),
			monthlyAmount: body.sponsorship.tier.monthly_price_in_dollars,
			lastEarningDate: new Date().toISOString(),
		}, { services, database, getSchema });
		const creditsId = await addCredits({
			githubLogin: body.sponsorship.sponsor.login,
			githubId: body.sponsorship.sponsor.id.toString(),
			amount: body.sponsorship.tier.monthly_price_in_dollars,
		}, { services, database, getSchema, env });
		return `Sponsor with id: ${sponsorId} created. Credits item with id: ${creditsId} created. Recurring sponsorship handled.`;
	}
}
