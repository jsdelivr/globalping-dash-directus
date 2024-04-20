import { defineOperationApi } from '@directus/extensions-sdk';
import { getGithubSponsors } from './repositories/github.js';
import { getDirectusSponsors } from './repositories/directus.js';
import { handleDirectusSponsor } from './actions/handle-directus-sponsor.js';
import { handleGithubSponsor } from './actions/handle-github-sponsor.js';

export default defineOperationApi({
	id: 'sponsors-cron-handler',
	handler: async (_operationData, { database, env, getSchema, services }) => {
		const githubSponsors = await getGithubSponsors({ env });
		const directusSponsors = await getDirectusSponsors({ services, database, getSchema, env });
		const results: string[] = [];

		// Update the directus sponsors data with the github sponsors data
		for (const directusSponsor of directusSponsors) {
			const result = await handleDirectusSponsor({ directusSponsor, githubSponsors }, { services, database, getSchema, env });

			if (result) {
				results.push(result);
			}
		}

		// Add missing github sponsors
		for (const githubSponsor of githubSponsors) {
			const result = await handleGithubSponsor({ githubSponsor, directusSponsors }, { services, database, getSchema, env });

			if (result) {
				results.push(result);
			}
		}

		return results;
	},
});
