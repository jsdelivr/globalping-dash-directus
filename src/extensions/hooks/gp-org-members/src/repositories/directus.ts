import type { Knex } from 'knex';
import type { Membership } from '../types.js';

export const getMemberships = async (ids: string[], database: Knex): Promise<Membership[]> => {
	return await database('gp_org_members')
		.whereIn('id', ids)
		.select('id', 'org', 'user') as Membership[];
};
