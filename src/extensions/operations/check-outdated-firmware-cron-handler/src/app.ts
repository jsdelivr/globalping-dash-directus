import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'check-outdated-firmware-cron-handler',
	name: 'Check outdated firmware CRON handler',
	icon: 'schedule',
	description: 'Send notifications to the adopted probes with outdated firmware or node version.',
	overview: () => [],
	options: [],
});
