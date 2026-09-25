import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { addUsernames } from './actions/add-usernames.js';
import { validatePreferences, validateRole } from './actions/validate.js';
import { getMemberships } from './repositories/directus.js';
import type { Fields, MemberRow } from './types.js';

const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export default defineHook(({ filter }) => {
	filter('gp_org_members.items.read', async (payload, _meta, context) => {
		const members = payload as MemberRow[];
		const { accountability } = context;

		if (!accountability?.user) { return payload; }

		await addUsernames(members, context);

		return payload;
	});

	// `role` and `notification_preferences` need different update rules, but a Directus permission applies a single rule to the whole update - so they are authorized here instead.
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
