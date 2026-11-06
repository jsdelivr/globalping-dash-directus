import { ErrorCode, isDirectusError } from '@directus/errors';
import type { ApiExtensionContext } from '@directus/extensions';
import { generateBytes } from './bytes.js';
import { releaseDeprecatedPrefix } from './deprecate-prefix.js';
import type { GithubOrganization } from './github-api-client.js';
import { getLinkGenerator } from './link-generator.js';
import { sendNotification } from './send-notification.js';

type User = {
	id: string;
	external_identifier: string | null;
};

type Org = {
	id: string;
	name: string;
	github_id: string;
	default_role: string;
	public_probes: boolean;
};

type Membership = {
	id: string;
	role: string;
	org: Pick<Org, 'id' | 'github_id'>;
};

export const syncOrganizations = async (user: User, githubOrgs: GithubOrganization[], context: ApiExtensionContext) => {
	const directusOrgs = await createOrgs(githubOrgs, context);
	const memberships = await getMemberships(user, context);
	await Promise.all([
		createMemberships(user, githubOrgs, directusOrgs, memberships, context),
		removeMemberships(user, githubOrgs, memberships, context),
	]);
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
			directusOrgs.set(githubOrg.githubId, await createOrg(githubOrg, context));
		} else if (directusOrg.name !== githubOrg.login) {
			await renameOrg(directusOrg, githubOrg.login, context);
		}
	}));

	return directusOrgs;
};

const createOrg = async (githubOrg: GithubOrganization, context: ApiExtensionContext): Promise<Org> => {
	const { services, getSchema } = context;
	const orgsService = new services.ItemsService('gp_orgs', { schema: await getSchema() });

	try {
		const id = await orgsService.createOne({
			name: githubOrg.login,
			github_id: githubOrg.githubId,
			adoption_token: await generateBytes(),
		}) as string;
		// Org credits are assigned to the org by a trigger.

		await releaseDeprecatedPrefix(githubOrg.login, context);

		return { id, name: githubOrg.login, github_id: githubOrg.githubId, default_role: 'member', public_probes: false };
	} catch (error) {
		// A concurrent sync of another member may create the org first; the loser then reads the winner's row.
		if (!isDirectusError(error, ErrorCode.RecordNotUnique)) {
			throw error;
		}

		const [ org ] = await orgsService.readByQuery({ filter: { github_id: { _eq: githubOrg.githubId } } }) as Org[];
		return org!;
	}
};

const renameOrg = async (org: Org, name: string, context: ApiExtensionContext) => {
	await context.database.transaction(async (trx) => {
		const changed = await trx('gp_orgs')
			.where({ id: org.id, name: org.name })
			// With public probes on, the old `u-<name>` tag keeps working until an org admin confirms the new one.
			.update(org.public_probes ? { name, deprecated_prefix: org.name } : { name });

		if (changed && org.public_probes) {
			await sendOrgTagChangeNotification(org, name, context, trx);
		}
	});

	await releaseDeprecatedPrefix(name, context);
};

const sendOrgTagChangeNotification = async (org: Org, name: string, context: ApiExtensionContext, trx: ApiExtensionContext['database']) => {
	const account = await trx('gp_accounts').where({ org: org.id }).first<{ id: string }>('id');
	const defaultTagChangeLink = getLinkGenerator(context).generateDefaultTagChangeLink({ orgId: org.id });

	await sendNotification({
		account_id: account.id,
		type: 'default_tag_change',
		subject: 'Action required: Confirm the default probe tag of your organization',
		message: `The default tag of your organization **${name}** has changed from **u-${org.name}** to **u-${name}**.\n\nThe old **u-${org.name}** tag keeps working until you [confirm the new one](${defaultTagChangeLink}).`,
	}, context, trx);
};

const getMemberships = async (user: User, { services, getSchema }: ApiExtensionContext) => {
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	return await membersService.readByQuery({
		filter: { user: { _eq: user.id } },
		fields: [ 'id', 'role', 'org.id', 'org.github_id' ],
	}) as Membership[];
};

const createMemberships = async (user: User, githubOrgs: GithubOrganization[], directusOrgs: Map<string, Org>, memberships: Membership[], context: ApiExtensionContext) => {
	const { services, getSchema } = context;
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	const membershipByGithubId = new Map(memberships.map(membership => [ membership.org.github_id, membership ]));

	await Promise.all(githubOrgs.map(async (githubOrg) => {
		const membership = membershipByGithubId.get(githubOrg.githubId);

		if (!membership) {
			const org = directusOrgs.get(githubOrg.githubId)!;

			await membersService.createOne({
				org: org.id,
				user: user.id,
				role: githubOrg.role === 'admin' ? 'admin' : org.default_role,
			}).catch((error: unknown) => {
				// A concurrent sync of the same user may create the membership first.
				if (!isDirectusError(error, ErrorCode.RecordNotUnique)) {
					throw error;
				}
			});
		// An org admin can assign the roles here too, so GitHub only promotes: a manually promoted admin stays an admin.
		} else if (githubOrg.role === 'admin' && membership.role !== 'admin') {
			await membersService.updateOne(membership.id, { role: 'admin' });
		}
	}));
};

const removeMemberships = async (user: User, githubOrgs: GithubOrganization[], memberships: Membership[], context: ApiExtensionContext) => {
	const { services, getSchema } = context;
	const membersService = new services.ItemsService('gp_org_members', { schema: await getSchema() });

	const githubIds = new Set(githubOrgs.map(githubOrg => githubOrg.githubId));
	const removed = memberships.filter(membership => !githubIds.has(membership.org.github_id));

	if (removed.length === 0) {
		return;
	}

	await Promise.all([
		// The member's org tokens and approvals are removed by a database trigger.
		membersService.deleteMany(removed.map(membership => membership.id)),
		unselectOrgs(user.id, removed.map(membership => membership.org.id), context),
	]);
};

export const unselectOrgs = async (userId: string, removedOrgIds: string[], { database, services, getSchema }: ApiExtensionContext) => {
	await database.transaction(async (trx) => {
		const user = await trx('directus_users').where({ id: userId }).forUpdate().first('selected_orgs');
		const selectedOrgs: string[] = JSON.parse(user?.selected_orgs || '[]');
		const remaining = selectedOrgs.filter(orgId => !removedOrgIds.includes(orgId));

		if (remaining.length === selectedOrgs.length) {
			return;
		}

		const usersService = new services.UsersService({ schema: await getSchema(), knex: trx });
		await usersService.updateOne(userId, { selected_orgs: remaining }, { emitEvents: false });
	});
};
