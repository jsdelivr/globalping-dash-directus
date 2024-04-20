import { defineOperationApi } from '@directus/extensions-sdk';
import { removeBannedUsers } from './actions/remove-banned-users.js';

export default defineOperationApi({
	id: 'remove-banned-users-cron-handler',
	handler: async (_operationData, context) => {
		const results = await removeBannedUsers(context);

		return results.length ? `Removed users with ids: ${results.toString()}.` : 'No users removed.';
	},
});
