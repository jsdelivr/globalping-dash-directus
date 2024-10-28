import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import { removeExpiredProbes } from './actions/remove-expired-probes.js';

export default defineOperationApi({
	id: 'remove-expired-adoptions-cron-handler',
	handler: async (_operationData, context) => {
		const { removedIds, notifiedIds } = await removeExpiredProbes(context as OperationContext);

		return `Removed probes with ids: ${removedIds.toString() || '[]'}. Notified probes with ids:  ${notifiedIds.toString() || '[]'}.`;
	},
});
