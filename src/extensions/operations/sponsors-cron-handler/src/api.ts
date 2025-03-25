import { defineOperationApi } from '@directus/extensions-sdk';
import { handleDirectusSponsor } from './actions/handle-directus-sponsor.js';
import { handleGithubSponsor } from './actions/handle-github-sponsor.js';
import { getDirectusSponsors } from './repositories/directus.js';
import { getGithubSponsors } from './repositories/github.js';

export default defineOperationApi({
	id: 'sponsors-cron-handler',
	handler: async (_operationData, context) => {
		const githubSponsors = await getGithubSponsors(context);
		const directusSponsors = await getDirectusSponsors(context);
		const results: string[] = [];

		// Update the directus sponsors data with the github sponsors data
		for (const directusSponsor of directusSponsors) {
			const result = await handleDirectusSponsor({ directusSponsor, githubSponsors }, context);

			if (result) {
				results.push(result);
			}
		}

		// Add missing github sponsors
		for (const githubSponsor of githubSponsors) {
			const result = await handleGithubSponsor({ githubSponsor, directusSponsors }, context);

			if (result) {
				results.push(result);
			}
		}

		return results;
	},
});
