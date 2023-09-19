
import { OperationContext } from '@directus/types';
import { DirectusSponsor, GithubSponsor } from '../types'
import { createDirectusSponsor } from '../repositories/directus';

type HandleSponsorData = {
	githubSponsor: GithubSponsor;
	directusSponsors: DirectusSponsor[];
}
type HandleSponsorContext = {
		services: OperationContext['services'];
		database: OperationContext['database'];
		getSchema: OperationContext['getSchema'];
		env: OperationContext['env'];
}
export const handleGithubSponsor = async ({ githubSponsor, directusSponsors }: HandleSponsorData, { services, database, getSchema, env }: HandleSponsorContext) => {
	const id = githubSponsor.githubId;
	const directusSponsor = directusSponsors.find(directusSponsor => directusSponsor.githubId === id);

	if (!directusSponsor && githubSponsor.isActive && !githubSponsor.isOneTimePayment) {
		await createDirectusSponsor(githubSponsor, { services, database, getSchema, env });
		return `Sponsor with github id: ${id} not found on directus sponsors list. Sponsor added to directus.`;
	}

	return null;
};
