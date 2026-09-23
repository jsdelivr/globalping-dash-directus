import type { EventContext } from '@directus/types';
import type { ExtraAdoptionToken } from '../types.js';

// The tokens are not available by permissions, so they are read directly for the orgs where the user is an admin.
export const getAdoptionTokens = async (orgIds: string[], { accountability, database }: EventContext) => {
	const rows = await database('gp_orgs')
		.join('gp_org_members', 'gp_org_members.org', 'gp_orgs.id')
		.whereIn('gp_orgs.id', orgIds)
		.where({ 'gp_org_members.user': accountability!.user, 'gp_org_members.role': 'admin' })
		.select('gp_orgs.id', 'gp_orgs.adoption_token', 'gp_orgs.extra_adoption_tokens') as { id: string; adoption_token: string; extra_adoption_tokens: string }[];

	return new Map(rows.map(row => [ row.id, {
		adoption_token: row.adoption_token,
		extra_adoption_tokens: JSON.parse(row.extra_adoption_tokens) as ExtraAdoptionToken[],
	}]));
};

export const getExtraAdoptionTokens = async (orgId: string, { database }: EventContext): Promise<ExtraAdoptionToken[]> => {
	const row = await database('gp_orgs').where({ id: orgId }).first<{ extra_adoption_tokens: string }>('extra_adoption_tokens');

	return JSON.parse(row.extra_adoption_tokens) as ExtraAdoptionToken[];
};
