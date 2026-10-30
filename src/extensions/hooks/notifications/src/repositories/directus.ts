import type { HookExtensionContext } from '@directus/extensions';
import type { OrgMember } from '../types.js';

const MEMBER_FIELDS = [ 'user.id', 'user.email', 'user.selected_orgs', 'notification_preferences' ];

const hasSelectedOrg = (orgId: string) => (member: OrgMember) => member.user.selected_orgs.includes(orgId);

export const getOrgAdmins = async (orgId: string, { services, getSchema }: HookExtensionContext): Promise<OrgMember[]> => {
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });

	const members = await membersService.readByQuery({
		filter: { org: { _eq: orgId }, role: { _eq: 'admin' } },
		fields: MEMBER_FIELDS,
	}) as OrgMember[];

	return members.filter(hasSelectedOrg(orgId));
};

export const getOrgAdmin = async (orgId: string, userId: string, { services, getSchema }: HookExtensionContext): Promise<OrgMember | undefined> => {
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });

	const [ member ] = await membersService.readByQuery({
		filter: { org: { _eq: orgId }, user: { _eq: userId }, role: { _eq: 'admin' } },
		fields: MEMBER_FIELDS,
	}) as OrgMember[];

	return member && hasSelectedOrg(orgId)(member) ? member : undefined;
};
