import { defineOperationApi } from '@directus/extensions-sdk';
import { getGithubSponsors } from './repositories/github';
import { getDirectusSponsors } from './repositories/directus';
import { handleDirectusSponsor } from './actions/handle-directus-sponsor';
import { handleGithubSponsor } from './actions/handle-github-sponsor';

export default defineOperationApi({
	id: 'sponsors-cron-handler',
	handler: async ({}, { database, env, getSchema, services }) => {
		const directusSponsors = await getDirectusSponsors({ services, database, getSchema, env });
		const githubSponsors = await getGithubSponsors({ env });
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
