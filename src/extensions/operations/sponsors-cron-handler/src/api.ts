import { defineOperationApi } from '@directus/extensions-sdk';
import { handleDirectusSponsor } from './actions/handle-directus-sponsor.js';
import { handleGithubSponsor } from './actions/handle-github-sponsor.js';
import { sponsorActivitiesHandler } from './actions/handle-sponsor-activities.js';
import { getDirectusSponsors } from './repositories/directus.js';
import { getGithubSponsors } from './repositories/github-sponsors.js';

export default defineOperationApi({
	id: 'sponsors-cron-handler',
	handler: async (_operationData, context) => {
		const results: string[] = [];

		// Catch sponsor activities missed by the webhook.
		const activitiesResults = await sponsorActivitiesHandler.handle(context);
		results.push(...activitiesResults);

		const githubSponsors = await getGithubSponsors(context);
		const directusSponsors = await getDirectusSponsors(context);

		// Sync existing directus sponsors info with github.
		for (const directusSponsor of directusSponsors) {
			const result = await handleDirectusSponsor({ directusSponsor, githubSponsors }, context);

			if (result) {
				results.push(result);
			}
		}

		// Add missing github sponsors to directus.
		for (const githubSponsor of githubSponsors) {
			const result = await handleGithubSponsor({ githubSponsor, directusSponsors }, context);

			if (result) {
				results.push(result);
			}
		}

		return results;
	},
});
