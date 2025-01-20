import { defineOperationApi } from '@directus/extensions-sdk';
import { checkOutdatedFirmware } from './actions/check-outdated-firmware.js';

export default defineOperationApi({
	id: 'check-outdated-firmware-cron-handler',
	handler: async (_operationData, context) => {
		const notifiedIds = await checkOutdatedFirmware(context);

		return `Notified probes with ids: ${notifiedIds.toString() || '[]'}.`;
	},
});
