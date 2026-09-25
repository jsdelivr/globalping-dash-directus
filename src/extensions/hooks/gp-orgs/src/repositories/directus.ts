import type { Knex } from 'knex';

// The token is not available by permissions, so it is read directly for the orgs where the user is an admin.
export const getAdoptionTokens = async (orgIds: string[], userId: string, database: Knex): Promise<Map<string, string>> => {
	const rows = await database('gp_orgs')
		.join('gp_org_members', 'gp_org_members.org', 'gp_orgs.id')
		.whereIn('gp_orgs.id', orgIds)
		.where({ 'gp_org_members.user': userId, 'gp_org_members.role': 'admin' })
		.select('gp_orgs.id', 'gp_orgs.adoption_token') as { id: string; adoption_token: string }[];

	return new Map(rows.map(row => [ row.id, row.adoption_token ]));
};
