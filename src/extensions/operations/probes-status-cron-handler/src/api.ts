import { setTimeout } from 'node:timers/promises';
import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import _ from 'lodash';
import { checkOnlineStatus } from './actions/check-online-status.js';

export default defineOperationApi({
	id: 'probes-status-cron-handler',
	handler: async (_operationData, context: OperationContext) => {
		const timeOffset = _.random(0, 5 * 60 * 1000);
		await setTimeout(timeOffset);

		const onlineIds = await checkOnlineStatus(context);

		return onlineIds.length ? `Online probes ids: ${onlineIds.toString()}` : 'No online probes';
	},
});
