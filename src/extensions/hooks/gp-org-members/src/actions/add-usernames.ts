import type { EventContext } from '@directus/types';
import { getUsernames } from '../repositories/directus.js';
import type { MemberRow } from '../types.js';

export const addUsernames = async (members: MemberRow[], context: EventContext) => {
	const ids = members.map(member => member.id).filter(Boolean) as string[];

	if (ids.length === 0) { return; }

	const usernames = await getUsernames(ids, context);
	members.forEach(member => Object.assign(member, member.id && { github_username: usernames.get(member.id) }));
};
