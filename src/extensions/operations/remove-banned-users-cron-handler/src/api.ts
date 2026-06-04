import { defineOperationApi } from '@directus/extensions-sdk';
import { removeBannedUsers } from './actions/remove-banned-users.js';

export default defineOperationApi({
	id: 'remove-banned-users-cron-handler',
	handler: async (_operationData, context) => {
		const { suspended, activated, deleted } = await removeBannedUsers(context);

		const parts = [
			`suspended: [${suspended.toString()}]`,
			`activated: [${activated.toString()}]`,
			`deleted: [${deleted.toString()}]`,
		];

		return `Users ${parts.join('; ')}.`;
	},
});
