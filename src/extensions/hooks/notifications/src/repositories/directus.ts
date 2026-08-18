import type { HookExtensionContext } from '@directus/extensions';
import type { OrgAdmin } from '../types.js';

export const getOrgAdmins = async (orgId: string, { services, getSchema }: HookExtensionContext): Promise<OrgAdmin[]> => {
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });

	return await membersService.readByQuery({
		filter: { org: { _eq: orgId }, role: { _eq: 'admin' } },
		fields: [ 'user.id', 'user.email', 'notification_preferences' ],
		limit: -1,
	}) as OrgAdmin[];
};
