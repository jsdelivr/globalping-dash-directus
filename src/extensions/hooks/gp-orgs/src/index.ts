import { defineHook } from '@directus/extensions-sdk';
import type { Knex } from 'knex';

type Org = {
	id?: string;
	adoption_token?: string;
};

// The read permission exposes the same fields to every member, so the admin-only field is stripped here.
// A read filter rather than a read action: the action is not awaited, so an async mutation there would miss the response.
export default defineHook(({ filter }) => {
	filter('gp_orgs.items.read', async (payload, _meta, context) => {
		const orgs = payload as Org[];
		const { accountability, database } = context;

		if (!accountability?.user || accountability.admin) {
			return payload;
		}

		const orgsWithToken = orgs.filter(org => org.adoption_token);

		if (orgsWithToken.length === 0) {
			return payload;
		}

		// A token read without the org id can not be checked, so it is stripped as well.
		const orgIds = orgsWithToken.map(org => org.id).filter(Boolean) as string[];
		const adminOrgIds = await getAdminOrgIds(orgIds, accountability.user, database);

		for (const org of orgsWithToken) {
			if (!org.id || !adminOrgIds.has(org.id)) {
				delete org.adoption_token;
			}
		}

		return payload;
	});
});

const getAdminOrgIds = async (orgIds: string[], userId: string, database: Knex): Promise<Set<string>> => {
	if (orgIds.length === 0) {
		return new Set();
	}

	const memberships = await database('gp_org_members')
		.whereIn('org', orgIds)
		.where({ user: userId, role: 'admin' })
		.select('org') as { org: string }[];

	return new Set(memberships.map(membership => membership.org));
};
