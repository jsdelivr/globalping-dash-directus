import { defineHook } from '@directus/extensions-sdk';
import { addAdoptionToken } from './actions/add-adoption-token.js';
import type { Org } from './types.js';

export default defineHook(({ filter }) => {
	filter('gp_orgs.items.read', async (payload, _meta, context) => {
		const orgs = payload as Org[];
		const { accountability, database } = context;

		if (!accountability?.user || accountability.admin) {
			return payload;
		}

		await addAdoptionToken(orgs, accountability.user, database);

		return payload;
	});
});
