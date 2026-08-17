import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';

type Fields = {
	role?: string;
	notification_preferences?: unknown;
};

type Membership = {
	id: string;
	org: string;
	user: string;
};

const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);
const ForbiddenRoleError = createError('INVALID_PAYLOAD_ERROR', 'Only an admin of the org can change roles.', 400);
const ForbiddenPreferencesError = createError('INVALID_PAYLOAD_ERROR', 'Notification preferences can only be changed on your own membership.', 400);

// The update permission covers both fields at once, and permissions can't split the fields of one action into separate rules -
// so the per-field rules live here.
export default defineHook(({ filter }) => {
	filter('gp_org_members.items.update', async (payload, meta, context) => {
		const fields = payload as Fields;
		const keys = meta.keys as string[];
		const { accountability, database } = context;

		if (accountability?.admin) {
			return;
		}

		if (!('role' in fields) && !('notification_preferences' in fields)) {
			return;
		}

		if (!accountability?.user) {
			throw new UserNotFoundError();
		}

		const memberships = await database('gp_org_members')
			.whereIn('id', keys)
			.select('id', 'org', 'user') as Membership[];

		if ('notification_preferences' in fields && memberships.some(membership => membership.user !== accountability.user)) {
			throw new ForbiddenPreferencesError();
		}

		if ('role' in fields) {
			const orgIds = [ ...new Set(memberships.map(membership => membership.org)) ];

			const adminMemberships = await database('gp_org_members')
				.whereIn('org', orgIds)
				.where({ user: accountability.user, role: 'admin' })
				.select('org') as { org: string }[];

			const adminOrgIds = new Set(adminMemberships.map(membership => membership.org));

			if (orgIds.some(orgId => !adminOrgIds.has(orgId))) {
				throw new ForbiddenRoleError();
			}
		}
	});
});
