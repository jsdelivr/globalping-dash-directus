import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { validatePreferences, validateRole } from './actions/validate.js';
import { getMemberships } from './repositories/directus.js';
import type { Fields } from './types.js';

const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

// The update permission covers both fields at once, and permissions can't split the fields of one action into separate rules -
// so the per-field rules live here.
export default defineHook(({ filter }) => {
	filter('gp_org_members.items.update', async (payload, meta, context) => {
		const fields = payload as Fields;
		const keys = meta.keys as string[];
		const { accountability, database } = context;

		if (!accountability || accountability.admin) {
			return;
		}

		if (!('role' in fields) && !('notification_preferences' in fields)) {
			return;
		}

		if (!accountability?.user) {
			throw new UserNotFoundError();
		}

		const memberships = await getMemberships(keys, database);

		if ('notification_preferences' in fields) {
			validatePreferences(fields, memberships, accountability.user);
		}

		if ('role' in fields) {
			await validateRole(memberships, accountability.user, database);
		}
	});
});
