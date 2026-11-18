import type { EventContext } from '@directus/types';
import { getGitHubProfiles } from '../repositories/directus.js';
import type { MemberRow } from '../types.js';

export const addGitHubProfiles = async (members: MemberRow[], context: EventContext) => {
	const ids = members.map(member => member.id).filter(Boolean) as string[];

	if (ids.length === 0) { return; }

	const profiles = await getGitHubProfiles(ids, context);
	members.forEach(member => Object.assign(member, member.id && profiles.get(member.id)));
};
