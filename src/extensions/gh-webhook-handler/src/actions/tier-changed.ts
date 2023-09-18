import { OperationContext } from '@directus/types';
import { addCredits } from '../repositories/credits.js';
import { updateSponsor } from '../repositories/sponsors.js';
import { Data } from '../types.js';

type TierChangedActionArgs = {
	services: OperationContext['services'];
	database: OperationContext['database'];
	getSchema: OperationContext['getSchema'];
	env: OperationContext['env'];
	body: Data['$trigger']['body'];
};

export const tierChangedAction = async ({ body, services, database, getSchema, env }: TierChangedActionArgs) => {
	if (!body?.sponsorship?.sponsor) {
		throw new Error(`"sponsorship.sponsor" field is ${body?.sponsorship?.sponsor}`);
	}

	if (!body.changes) {
		throw new Error(`"body.changes" field is ${body.changes}`);
	}

	const tierDiff = body.sponsorship.tier.monthly_price_in_dollars - body.changes.tier.from.monthly_price_in_dollars;

	if (tierDiff > 0) {
		const sponsorId = await updateSponsor({
			githubId: body.sponsorship.sponsor.id.toString(),
			monthlyAmount: body.sponsorship.tier.monthly_price_in_dollars,
		}, { services, database, getSchema });
		const creditsId = await addCredits({
			githubLogin: body.sponsorship.sponsor.login,
			githubId: body.sponsorship.sponsor.id.toString(),
			amount: tierDiff,
		}, { services, database, getSchema, env });
		return `Sponsor with id: ${sponsorId} updated. Credits item with id: ${creditsId} created.`
	} else {
		const sponsorId = await updateSponsor({
			githubId: body.sponsorship.sponsor.id.toString(),
			monthlyAmount: body.sponsorship.tier.monthly_price_in_dollars,
		}, { services, database, getSchema });
		return `Sponsor with id: ${sponsorId} updated.`;
	}
}
