import type { EventContext } from '@directus/types';
import type { Knex } from 'knex';
import type { Membership } from '../types.js';

export const getMemberships = async (ids: string[], database: Knex): Promise<Membership[]> => {
	return await database('gp_org_members')
		.whereIn('id', ids)
		.select('id', 'org', 'user') as Membership[];
};

// The row of another user is not readable by permissions, so the names are read directly for the memberships the caller may see.
export const getUsernames = async (userIds: string[], { database }: EventContext) => {
	const rows = await database('directus_users')
		.whereIn('id', userIds)
		.select('id', 'github_username') as { id: string; github_username: string }[];

	return new Map(rows.map(row => [ row.id, row.github_username ]));
};
