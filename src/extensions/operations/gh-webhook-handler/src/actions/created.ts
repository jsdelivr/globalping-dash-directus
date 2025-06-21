import type { OperationContext } from '@directus/extensions';
import { addCredits } from '../../../../lib/src/add-credits.js';
import { addSponsor } from '../repositories/sponsors.js';
import type { Data } from '../types.js';

export const createdAction = async (body: Data['$trigger']['body'], context: OperationContext) => {
	const { services, database, getSchema } = context;

	if (!body?.sponsorship?.sponsor) {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor?.toString()}`);
	}

	if (body.sponsorship.tier.is_one_time) {
		const { creditsId } = await addCredits({
			github_id: body.sponsorship.sponsor.id.toString(),
			amount: body.sponsorship.tier.monthly_price_in_dollars,
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: body.sponsorship.tier.monthly_price_in_dollars },
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
		reason: 'recurring_sponsorship',
		meta: { amountInDollars: body.sponsorship.tier.monthly_price_in_dollars },
	}, context);
	return `Sponsor with id: ${sponsorId} created. Credits item with id: ${creditsId} created. Recurring sponsorship handled.`;
};
