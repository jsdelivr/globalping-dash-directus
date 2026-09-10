import { defineHook } from '@directus/extensions-sdk';
import { getAdoptionTokens } from './repositories/directus.js';

type Org = {
	id?: string;
	adoption_token?: string;
};

export default defineHook(({ filter }) => {
	filter('gp_orgs.items.read', async (payload, _meta, context) => {
		const orgs = payload as Org[];
		const { accountability, database } = context;

		if (!accountability?.user || accountability.admin) {
			return payload;
		}

		const orgIds = orgs.map(org => org.id).filter(Boolean) as string[];

		if (orgIds.length === 0) {
			return payload;
		}

		const tokens = await getAdoptionTokens(orgIds, accountability.user, database);

		for (const org of orgs) {
			const token = org.id && tokens.get(org.id);

			if (token) {
				org.adoption_token = token;
			}
		}

		return payload;
	});
});
