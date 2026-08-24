import type { ApiExtensionContext } from '@directus/extensions';
import { generateBytes } from './bytes.js';
import type { GithubOrganization } from './github-api-client.js';

type User = {
	id: string;
	external_identifier: string | null;
};

type Org = {
	id: string;
	name: string;
	github_id: string;
};

type Membership = {
	id: string;
	role: string;
	org: Org;
};

export const syncOrganizations = async (user: User, githubOrgs: GithubOrganization[], context: ApiExtensionContext) => {
	const directusOrgs = await createOrgs(githubOrgs, context);
	const memberships = await getMemberships(user, context);
	await createMemberships(user, githubOrgs, directusOrgs, memberships, context);
	await removeMemberships(githubOrgs, memberships, context);
};

const createOrgs = async (githubOrgs: GithubOrganization[], context: ApiExtensionContext) => {
	const { services, getSchema } = context;
	const orgsService = new services.ItemsService('gp_orgs', { schema: await getSchema() });

	const existingOrgs = await orgsService.readByQuery({
		filter: { github_id: { _in: githubOrgs.map(githubOrg => githubOrg.githubId) } },
	}) as Org[];

	const directusOrgs = new Map(existingOrgs.map(org => [ org.github_id, org ]));

	await Promise.all(githubOrgs.map(async (githubOrg) => {
		const directusOrg = directusOrgs.get(githubOrg.githubId);

		if (!directusOrg) {
			const id = await orgsService.createOne({
				name: githubOrg.login,
				github_id: githubOrg.githubId,
				adoption_token: await generateBytes(),
			}) as string;
			// Org credits are assigned to the org by a trigger.

			directusOrgs.set(githubOrg.githubId, { id, name: githubOrg.login, github_id: githubOrg.githubId });
		} else if (directusOrg.name !== githubOrg.login) {
			await orgsService.updateOne(directusOrg.id, { name: githubOrg.login });
		}
	}));

	return directusOrgs;
};

const getMemberships = async (user: User, { services, getSchema }: ApiExtensionContext) => {
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	return await membersService.readByQuery({
		filter: { user: { _eq: user.id } },
		fields: [ 'id', 'role', 'org.github_id' ],
	}) as Membership[];
};

const createMemberships = async (user: User, githubOrgs: GithubOrganization[], directusOrgs: Map<string, Org>, memberships: Membership[], context: ApiExtensionContext) => {
	const { services, getSchema } = context;
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	const membershipByGithubId = new Map(memberships.map(membership => [ membership.org.github_id, membership ]));

	await Promise.all(githubOrgs.map(async (githubOrg) => {
		const membership = membershipByGithubId.get(githubOrg.githubId);

		if (!membership) {
			await membersService.createOne({
				org: directusOrgs.get(githubOrg.githubId)!.id,
				user: user.id,
				role: githubOrg.role,
			});
		// An org admin can assign the roles here too, so GitHub only promotes: a manually promoted admin stays an admin.
		} else if (githubOrg.role === 'admin' && membership.role !== 'admin') {
			await membersService.updateOne(membership.id, { role: 'admin' });
		}
	}));
};

const removeMemberships = async (githubOrgs: GithubOrganization[], memberships: Membership[], context: ApiExtensionContext) => {
	const { services, getSchema } = context;
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	const githubIds = new Set(githubOrgs.map(githubOrg => githubOrg.githubId));
	const removed = memberships.filter(membership => !githubIds.has(membership.org.github_id));

	await membersService.deleteMany(removed.map(membership => membership.id));
	// The member's org tokens and approvals are removed by a database trigger.
};
