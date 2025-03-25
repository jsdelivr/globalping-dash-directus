import type { OperationContext } from '@directus/extensions';
import { addCredits } from '../../../../lib/src/add-credits.js';
import { addSponsor } from '../repositories/sponsors.js';
import type { Data } from '../types.js';

export const createdAction = async (body: Data['$trigger']['body'], context: OperationContext) => {
	const { services, database, getSchema } = context;

	if (!body?.sponsorship?.sponsor) {
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor?.toString()}`);
	}

	if (body.sponsorship.tier.is_one_time) {
		const { creditsId } = await addCredits({
			github_id: body.sponsorship.sponsor.id.toString(),
			amount: body.sponsorship.tier.monthly_price_in_dollars,
			comment: `One-time $${body.sponsorship.tier.monthly_price_in_dollars} sponsorship.`,
		}, context);
		return `Credits item with id: ${creditsId} created. One-time sponsorship handled.`;
	}

	const sponsorId = await addSponsor({
		github_login: body.sponsorship.sponsor.login,
		github_id: body.sponsorship.sponsor.id.toString(),
		monthly_amount: body.sponsorship.tier.monthly_price_in_dollars,
		last_earning_date: new Date().toISOString(),
	}, { services, database, getSchema });
	const { creditsId } = await addCredits({
		github_id: body.sponsorship.sponsor.id.toString(),
		amount: body.sponsorship.tier.monthly_price_in_dollars,
		comment: `One-time $${body.sponsorship.tier.monthly_price_in_dollars} sponsorship.`,
	}, context);
	return `Sponsor with id: ${sponsorId} created. Credits item with id: ${creditsId} created. Recurring sponsorship handled.`;
};
