import type { EventContext } from '@directus/types';
import type { Knex } from 'knex';
import type { Membership } from '../types.js';

export const getMemberships = async (ids: string[], database: Knex): Promise<Membership[]> => {
	return await database('gp_org_members')
		.whereIn('id', ids)
		.select('id', 'org', 'user') as Membership[];
};

export const getUsernames = async (ids: string[], { database }: EventContext) => {
	const rows = await database('gp_org_members')
		.join('directus_users', 'directus_users.id', 'gp_org_members.user')
		.whereIn('gp_org_members.id', ids)
		.select('gp_org_members.id', 'directus_users.github_username') as { id: string; github_username: string }[];

	return new Map(rows.map(row => [ row.id, row.github_username ]));
};
