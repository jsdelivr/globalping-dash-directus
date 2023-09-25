
import { OperationContext } from '@directus/types';
import { DirectusSponsor, GithubSponsor } from '../types';
import { deleteDirectusSponsor, updateDirectusSponsor, addCredits } from '../repositories/directus';

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
type HandleSponsorContext = {
		services: OperationContext['services'];
		database: OperationContext['database'];
		getSchema: OperationContext['getSchema'];
		env: OperationContext['env'];
}

export const handleDirectusSponsor = async ({ directusSponsor, githubSponsors }: HandleSponsorData, { services, database, getSchema, env }: HandleSponsorContext) => {
	const id = directusSponsor.githubId;
	const githubSponsor = githubSponsors.find(githubSponsor => githubSponsor.githubId === id);

	if (!githubSponsor) {
		await deleteDirectusSponsor({ id: directusSponsor.id }, { services, database, getSchema, env });
		return `Sponsor with github id: ${id} not found on github sponsors list. Sponsor deleted from directus.`;
	}

	if (!githubSponsor.isActive) {
		await deleteDirectusSponsor({ id: directusSponsor.id }, { services, database, getSchema, env });
		return `Sponsor with github id: ${id} is not active on github sponsors list. Sponsor deleted from directus.`;
	}

	if (githubSponsor.isOneTimePayment) {
		await deleteDirectusSponsor({ id: directusSponsor.id }, { services, database, getSchema, env });
		return `Sponsorship of user with github id: ${id} is one-time. Sponsor deleted from directus.`;
	}

	if (githubSponsor.monthlyAmount !== directusSponsor.monthlyAmount) {
		await updateDirectusSponsor(directusSponsor.id, { monthlyAmount: githubSponsor.monthlyAmount }, { services, database, getSchema, env });
	}

	const shouldCreditsBeAdded = is30DaysAgo(directusSponsor.lastEarningDate);

	if (shouldCreditsBeAdded) {
		await updateDirectusSponsor(directusSponsor.id, { lastEarningDate: new Date().toISOString() }, { services, database, getSchema, env });
		const creditsId = await addCredits({
			githubLogin: githubSponsor.githubLogin,
			githubId: githubSponsor.githubId,
			amount: githubSponsor.monthlyAmount,
		}, { services, database, getSchema, env });
		return `Credits item with id: ${creditsId} for user with github id: ${id} created. Recurring sponsorship handled.`;
	}

	return null;
};
