import type { OperationContext } from '@directus/extensions';
import { addRecurringCredits, getFullMonthsSinceWithAdvance } from '../../../../lib/src/add-credits.js';
import { createDirectusSponsor } from '../repositories/directus.js';
import type { DirectusSponsor, GithubSponsor } from '../types.js';

type HandleSponsorData = {
	githubSponsor: GithubSponsor;
	directusSponsors: DirectusSponsor[];
};

export const handleGithubSponsor = async ({ githubSponsor, directusSponsors }: HandleSponsorData, context: OperationContext) => {
	const id = githubSponsor.githubId;
	const directusSponsor = directusSponsors.find(directusSponsor => directusSponsor.github_id === id);

	if (!directusSponsor && githubSponsor.isActive && !githubSponsor.isOneTimePayment) {
		const { monthsPassed, advancedDate } = getFullMonthsSinceWithAdvance(githubSponsor.tierSelectedAt);
		const monthsToAward = monthsPassed + 1;

		await createDirectusSponsor(githubSponsor, advancedDate, context);

		const { creditsId } = await addRecurringCredits({
			githubId: githubSponsor.githubId,
			monthlyAmount: githubSponsor.monthlyAmount,
			monthsToAward,
		}, context);

		return `Sponsor with github id: ${id} not found on directus sponsors list. Sponsor added to directus. Credits item with id: ${creditsId} created. Recurring sponsorship handled for ${monthsToAward} month(s).`;
	}

	return null;
};
