import type { OperationContext } from '@directus/extensions';
import { unselectOrgs } from '../../../../lib/src/sync-orgs.js';
import type { Org } from '../types.js';

type RemovedMembership = {
	org: string;
	user: { id: string; selected_orgs?: string[] };
};

type Row = {
	orgId: string;
	orgName: string;
	orgGithubId: string;
	membershipId: string;
	githubId: string | null;
	githubUsername: string | null;
	githubOauthToken: string | null;
};

export const getOrgsToCheck = async ({ database }: OperationContext): Promise<Org[]> => {
	const rows = await database('gp_org_members as m')
		.join('gp_orgs as o', 'o.id', 'm.org')
		.join('gp_accounts as a', 'a.org', 'o.id')
		.join('directus_users as u', 'u.id', 'm.user')
		.where((builder) => {
			builder
				// Filtering only orgs with issued tokens or app approvals.
				.whereIn('a.id', database('gp_tokens').select('account_id').whereNotNull('account_id'))
				.orWhereIn('a.id', database('gp_apps_approvals').select('account_id').whereNotNull('account_id'));
		})
		.select<Row[]>({
			orgId: 'o.id',
			orgName: 'o.name',
			orgGithubId: 'o.github_id',
			membershipId: 'm.id',
			githubId: 'u.external_identifier',
			githubUsername: 'u.github_username',
			githubOauthToken: 'u.github_oauth_token',
		});

	const orgs = new Map<string, Org>();

	for (const row of rows) {
		if (!row.githubId) {
			continue;
		}

		const org: Org = orgs.get(row.orgId) ?? { id: row.orgId, name: row.orgName, githubId: row.orgGithubId, members: [] };
		org.members.push({ membershipId: row.membershipId, githubId: row.githubId, githubUsername: row.githubUsername, githubOauthToken: row.githubOauthToken });
		orgs.set(row.orgId, org);
	}

	return [ ...orgs.values() ];
};

export const removeMemberships = async (membershipIds: string[], context: OperationContext) => {
	if (!membershipIds.length) {
		return;
	}

	const { services, getSchema } = context;
	const { ItemsService } = services;
	const membersService = new ItemsService('gp_org_members', { schema: await getSchema() });
	const removed = await membersService.readMany(membershipIds, { fields: [ 'org', 'user.id', 'user.selected_orgs' ] }) as RemovedMembership[];

	await membersService.deleteMany(membershipIds);
	// The members' org tokens and app approvals are removed by a database trigger.

	await Promise.all(removed.map(membership => unselectOrgs(membership.user, [ membership.org ], context)));
};
