import { setTimeout } from 'node:timers/promises';
import type { OperationContext } from '@directus/extensions';
import { defineOperationApi } from '@directus/extensions-sdk';
import _ from 'lodash';
import { increaseOnlineTimes } from './repositories/directus.js';

export default defineOperationApi({
	id: 'probes-status-cron-handler',
	handler: async (_operationData, context: OperationContext) => {
		if (context.env.ENABLE_E2E_MOCKS !== true) {
			await setTimeout(_.random(0, 5 * 60 * 1000));
		}

		const online = await increaseOnlineTimes(context);

		return online ? `Online probes count: ${online}` : 'No online probes';
	},
});
