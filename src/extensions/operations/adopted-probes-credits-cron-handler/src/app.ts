import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'adopted-probes-credits-cron-handler',
	name: 'Adopted probes credits CRON handler',
	icon: 'schedule',
	description: 'CRON job to assign credits for adopted probes.',
	overview: () => [],
	options: [],
});
