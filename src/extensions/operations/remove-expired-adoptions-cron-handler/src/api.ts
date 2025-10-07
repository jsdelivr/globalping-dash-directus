import { defineOperationApi } from '@directus/extensions-sdk';
import { removeExpiredAdoptions } from './actions/remove-expired-probes.js';

export default defineOperationApi({
	id: 'remove-expired-adoptions-cron-handler',
	handler: async (_operationData, context) => {
		const { removedAdoptionsIds, removedProbesIds, notifiedIds } = await removeExpiredAdoptions(context);

		return `Removed adopted probes: ${removedAdoptionsIds.join(', ') || '[]'}. Removed unassigned probes: ${removedProbesIds.join(', ') || '[]'}. Notified adoptions with ids: ${notifiedIds.join(', ') || '[]'}.`;
	},
});
