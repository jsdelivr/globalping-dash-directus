import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { getDirectusUsers, deleteCreditsAdditions, type DirectusUser } from './repositories/directus.js';
import { validateDefaultPrefix } from './validate-fields.js';

export type Fields = Partial<DirectusUser>;

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export default defineHook(({ filter }, context) => {
	filter('users.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (fields.default_prefix) {
			await validateDefaultPrefix(fields.default_prefix, keys, accountability, context);
		}
	});

	filter('users.delete', async (userIds, _payload, { accountability }) => {
		if (!accountability || !accountability.user) {
			throw new Error('User is not authenticated');
		}

		const users = await getDirectusUsers(userIds as string[], accountability, context);

		if (!users.length) {
			return;
		}

		await deleteCreditsAdditions(users, context);
	});
});
