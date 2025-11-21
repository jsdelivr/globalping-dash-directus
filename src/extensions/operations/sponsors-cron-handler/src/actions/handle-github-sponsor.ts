
import type { OperationContext } from '@directus/extensions';
import { createDirectusSponsor } from '../repositories/directus.js';
import type { DirectusSponsor, GithubSponsor } from '../types.js';
import { awardRecurringCredits, getFullMonthsSince } from '../utils.js';

type HandleSponsorData = {
	githubSponsor: GithubSponsor;
	directusSponsors: DirectusSponsor[];
};

export const handleGithubSponsor = async ({ githubSponsor, directusSponsors }: HandleSponsorData, context: OperationContext) => {
	const id = githubSponsor.githubId;
	const directusSponsor = directusSponsors.find(directusSponsor => directusSponsor.github_id === id);

	if (!directusSponsor && githubSponsor.isActive && !githubSponsor.isOneTimePayment) {
		await createDirectusSponsor(githubSponsor, context);

		const monthsPassed = githubSponsor.tierSelectedAt ? getFullMonthsSince(githubSponsor.tierSelectedAt) : 0;
		const monthsToAward = monthsPassed + 1;

		const { creditsId } = await awardRecurringCredits({
			githubId: githubSponsor.githubId,
			monthlyAmount: githubSponsor.monthlyAmount,
			monthsToAward,
		}, context);

		return `Sponsor with github id: ${id} not found on directus sponsors list. Sponsor added to directus. Credits item with id: ${creditsId} created. Recurring sponsorship handled for ${monthsToAward} month(s).`;
	}

	return null;
};
