import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'adopted-probes-status-cron-handler',
	name: 'Adopted probes status CRON handler',
	icon: 'schedule',
	description: 'CRON job to check if adopted probes are online.',
	overview: () => [],
	options: [],
});
