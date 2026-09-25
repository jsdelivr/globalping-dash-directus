import type { EventContext } from '@directus/types';
import { getUsernames } from '../repositories/directus.js';
import type { MemberRow } from '../types.js';

export const addUsernames = async (members: MemberRow[], context: EventContext) => {
	// `user` is the user id of the member, unless the read asked for it as a relation - then it is the related row.
	const userIds = members.map(member => member.user).filter(user => typeof user === 'string');

	if (userIds.length === 0) { return; }

	const usernames = await getUsernames(userIds, context);
	members.forEach(member => Object.assign(member, typeof member.user === 'string' && { github_username: usernames.get(member.user) }));
};
