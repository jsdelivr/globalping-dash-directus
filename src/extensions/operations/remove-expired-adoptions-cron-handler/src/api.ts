import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import { removeExpiredAdoptions } from './actions/remove-expired-probes.js';

export default defineOperationApi({
	id: 'remove-expired-adoptions-cron-handler',
	handler: async (_operationData, context) => {
		const { removedIds, notifiedIds } = await removeExpiredAdoptions(context as OperationContext);

		return `Removed adoptions for probes: ${removedIds.toString() || '[]'}. Notified adoptions with ids: ${notifiedIds.toString() || '[]'}.`;
	},
});
