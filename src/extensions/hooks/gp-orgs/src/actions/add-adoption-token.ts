import type { Knex } from 'knex';
import { getAdoptionTokens } from '../repositories/directus.js';
import type { Org } from '../types.js';

export const addAdoptionToken = async (orgs: Org[], userId: string, database: Knex) => {
	const orgIds = orgs.map(org => org.id).filter(Boolean) as string[];

	if (orgIds.length === 0) {
		return;
	}

	const tokens = await getAdoptionTokens(orgIds, userId, database);

	for (const org of orgs) {
		const token = org.id && tokens.get(org.id);

		if (token) {
			org.adoption_token = token;
		}
	}
};
