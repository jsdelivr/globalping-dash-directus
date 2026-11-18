import type { EventContext } from '@directus/types';
import { getAdoptionTokens } from '../repositories/directus.js';
import type { Org } from '../types.js';

export const addAdoptionTokens = async (orgs: Org[], context: EventContext) => {
	const orgIds = orgs.map(org => org.id).filter(Boolean) as string[];

	if (orgIds.length === 0) {
		return;
	}

	// The tokens are not available by permissions, so they are read directly for the orgs where the user is an admin.
	const tokens = await getAdoptionTokens(orgIds, context);

	orgs.forEach(org => Object.assign(org, org.id && tokens.get(org.id)));
};
