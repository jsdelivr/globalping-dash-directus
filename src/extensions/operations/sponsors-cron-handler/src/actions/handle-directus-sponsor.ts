import type { OperationContext } from '@directus/extensions';
import { getFullMonthsSinceWithAdvance, addRecurringCredits } from '../../../../lib/src/add-credits.js';
import { deleteDirectusSponsor, updateDirectusSponsor } from '../repositories/directus.js';
import type { DirectusSponsor, GithubSponsor } from '../types.js';

type HandleSponsorData = {
	directusSponsor: DirectusSponsor;
	githubSponsors: GithubSponsor[];
};

export const handleDirectusSponsor = async ({ directusSponsor, githubSponsors }: HandleSponsorData, context: OperationContext) => {
	const id = directusSponsor.github_id;
	const githubSponsor = githubSponsors.find(githubSponsor => githubSponsor.githubId === id);

	if (!githubSponsor) {
		await deleteDirectusSponsor(directusSponsor, context);
		return `Sponsor with github id: ${id} not found on github sponsors list. Sponsor deleted from directus.`;
	}

	if (!githubSponsor.isActive) {
		await deleteDirectusSponsor(directusSponsor, context);
		return `Sponsor with github id: ${id} is not active on github sponsors list. Sponsor deleted from directus.`;
	}

	if (githubSponsor.isOneTimePayment) {
		await deleteDirectusSponsor(directusSponsor, context);
		return `Sponsorship of user with github id: ${id} is one-time. Sponsor deleted from directus.`;
	}

	if (githubSponsor.monthlyAmount !== directusSponsor.monthly_amount) {
		await updateDirectusSponsor(directusSponsor.id, { monthly_amount: githubSponsor.monthlyAmount }, context);
	}

	const { monthsPassed, advancedDate } = getFullMonthsSinceWithAdvance(new Date(directusSponsor.last_earning_date));

	if (monthsPassed >= 1) {
		await updateDirectusSponsor(directusSponsor.id, { last_earning_date: advancedDate.toISOString() }, context);

		const { creditsId } = await addRecurringCredits({
			githubId: githubSponsor.githubId,
			monthlyAmount: githubSponsor.monthlyAmount,
			monthsToAward: monthsPassed,
		}, context);

		return `Credits item with id: ${creditsId} for user with github id: ${githubSponsor.githubId} created. Recurring sponsorship handled for ${monthsPassed} month(s).`;
	}

	return null;
};
