import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'probes-status-cron-handler',
	name: 'Probes status CRON handler',
	icon: 'schedule',
	description: 'CRON job to check if probes are online.',
	overview: () => [],
	options: [],
});
