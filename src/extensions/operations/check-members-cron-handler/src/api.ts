import { defineOperationApi } from '@directus/extensions-sdk';
import { checkMembers } from './actions/check-members.js';

export default defineOperationApi({
	id: 'check-members-cron-handler',
	handler: async (_operationData, context) => {
		const { checked, removed, errors } = await checkMembers(context);

		return `Checked ${checked} orgs. Removed memberships: [${removed.toString()}]. Errors: [${errors.toString()}].`;
	},
});
