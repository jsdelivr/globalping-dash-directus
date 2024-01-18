import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'sponsors-cron-handler',
	name: 'Sponsors CRON handler',
	icon: 'schedule',
	description: 'Handle sponsors CRON job. Manage directus sponsors state and assign credits to them every month.',
	overview: () => [],
	options: [],
});
