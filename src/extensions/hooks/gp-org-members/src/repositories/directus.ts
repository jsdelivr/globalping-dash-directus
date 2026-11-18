import type { EventContext } from '@directus/types';
import type { Knex } from 'knex';
import type { Membership } from '../types.js';

export const getMemberships = async (ids: string[], database: Knex): Promise<Membership[]> => {
	return await database('gp_org_members')
		.whereIn('id', ids)
		.select('id', 'org', 'user') as Membership[];
};

export const getGitHubProfiles = async (ids: string[], { database }: EventContext) => {
	const rows = await database('gp_org_members')
		.join('directus_users', 'directus_users.id', 'gp_org_members.user')
		.whereIn('gp_org_members.id', ids)
		.select<{ id: string; github_username: string | null; github_id: string | null }[]>(
			'gp_org_members.id',
			'directus_users.github_username',
			'directus_users.external_identifier as github_id',
		);

	return new Map(rows.map(({ id, ...profile }) => [ id, profile ]));
};
