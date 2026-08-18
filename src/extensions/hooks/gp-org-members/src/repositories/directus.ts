import type { Knex } from 'knex';
import type { Membership } from '../types.js';

export const getMemberships = async (ids: string[], database: Knex): Promise<Membership[]> => {
	return await database('gp_org_members')
		.whereIn('id', ids)
		.select('id', 'org', 'user') as Membership[];
};

export const getAdminOrgIds = async (orgIds: string[], userId: string, database: Knex): Promise<Set<string>> => {
	const memberships = await database('gp_org_members')
		.whereIn('org', orgIds)
		.where({ user: userId, role: 'admin' })
		.select('org') as { org: string }[];

	return new Set(memberships.map(membership => membership.org));
};
