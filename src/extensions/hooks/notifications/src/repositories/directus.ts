import type { HookExtensionContext } from '@directus/extensions';
import type { OrgMember } from '../types.js';

const MEMBER_FIELDS = [ 'user.id', 'user.email', 'notification_preferences' ];

export const getOrgAdmins = async (orgId: string, { services, getSchema }: HookExtensionContext): Promise<OrgMember[]> => {
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });

	return await membersService.readByQuery({
		filter: { org: { _eq: orgId }, role: { _eq: 'admin' } },
		fields: MEMBER_FIELDS,
	}) as OrgMember[];
};

export const getOrgMember = async (orgId: string, userId: string, { services, getSchema }: HookExtensionContext): Promise<OrgMember | undefined> => {
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });

	const [ member ] = await membersService.readByQuery({
		filter: { org: { _eq: orgId }, user: { _eq: userId } },
		fields: MEMBER_FIELDS,
	}) as OrgMember[];

	return member;
};
