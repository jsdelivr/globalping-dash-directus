import { defineOperationApi } from '@directus/extensions-sdk';
import { getGithubSponsors } from './repositories/github';
import { getDirectusSponsors } from './repositories/directus';
import { handleSponsor } from './actions/handle-sponsor';

export default defineOperationApi({
	id: 'sponsors-cron-handler',
	handler: async ({}, { database, env, getSchema, services }) => {
		const directusSponsors = await getDirectusSponsors({ services, database, getSchema, env });
		const githubSponsors = await getGithubSponsors({ env });
		const results: string[] = [];

		for (const directusSponsor of directusSponsors) {
			const result = await handleSponsor({ directusSponsor, githubSponsors }, { services, database, getSchema, env });
			if (result) {
				results.push(result);
			}
		}

		return results;
	},
});
