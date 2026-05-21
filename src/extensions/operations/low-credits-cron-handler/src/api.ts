import { defineOperationApi } from '@directus/extensions-sdk';
import { checkLowCredits } from './actions/check-low-credits.js';

export default defineOperationApi({
	id: 'low-credits-cron-handler',
	handler: async (_operationData, context) => {
		const { notified, reset } = await checkLowCredits(context);
		return `Notified users: ${notified.join(', ') || '[]'}. Reset users: ${reset.join(', ') || '[]'}.`;
	},
});
