import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'low-credits-cron-handler',
	name: 'Low credits CRON handler',
	icon: 'schedule',
	description: 'Sends a notification when a user\'s Globalping credits drop below threshold.',
	overview: () => [],
	options: [],
});
