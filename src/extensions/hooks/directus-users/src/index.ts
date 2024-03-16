import { defineHook } from '@directus/extensions-sdk';
import { getDirectusUsers, deleteCreditsAdditions } from './repositories/directus.js';

export default defineHook(({ filter }, context) => {
	filter('users.delete', async (userIds, _payload, { accountability }) => {
		if (!accountability) {
			throw new Error('User is not authenticated');
		}

		const users = await getDirectusUsers(userIds as string[], accountability, context);

		if (!users.length) {
			return;
		}

		await deleteCreditsAdditions(users, context);
	});
});
