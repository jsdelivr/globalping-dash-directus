
import type { OperationContext } from '@directus/extensions';
import { addCredits } from '../../../../lib/src/add-credits.js';
import { deleteDirectusSponsor, updateDirectusSponsor } from '../repositories/directus.js';
import type { DirectusSponsor, GithubSponsor } from '../types.js';

const is30DaysAgo = (dateString: string) => {
	const inputDate = new Date(dateString);
	const currentDate = new Date();

	const timeDifference = currentDate.getTime() - inputDate.getTime();
	const daysDifference = timeDifference / (1000 * 60 * 60 * 24);

	return daysDifference >= 30;
};

type HandleSponsorData = {
	directusSponsor: DirectusSponsor;
	githubSponsors: GithubSponsor[];
}

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

	const shouldCreditsBeAdded = is30DaysAgo(directusSponsor.last_earning_date);

	if (shouldCreditsBeAdded) {
		await updateDirectusSponsor(directusSponsor.id, { last_earning_date: new Date().toISOString() }, context);
		const creditsId = await addCredits({
			github_id: githubSponsor.githubId,
			amount: githubSponsor.monthlyAmount,
			comment: `Recurring $${githubSponsor.monthlyAmount} sponsorship.`,
		}, context);
		return `Credits item with id: ${creditsId} for user with github id: ${id} created. Recurring sponsorship handled.`;
	}

	return null;
};
