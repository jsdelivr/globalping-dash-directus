import { setTimeout } from 'node:timers/promises';
import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import _ from 'lodash';
import { checkOnlineStatus } from './actions/check-online-status';

export default defineOperationApi({
	id: 'adopted-probes-status-cron-handler',
	handler: async (_operationData, context: OperationContext) => {
		const maxDeviation = parseFloat(context.env['ADOPTED_PROBES_CHECK_TIME_MAX_DEVIATION_MINS']);

		if (!maxDeviation) {
			throw new Error('ADOPTED_PROBES_CHECK_TIME_MAX_DEVIATION_MINS was not provided');
		}

		const timeOffset = _.random(0, maxDeviation * 60 * 1000);
		await setTimeout(timeOffset);

		const onlineIds = await checkOnlineStatus(context);

		return onlineIds.length ? `Online adopted probes ids: ${onlineIds}` : 'No adopted online probes';
	},
});
