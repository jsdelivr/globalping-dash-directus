import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'remove-expired-adoptions-cron-handler',
	name: 'Remove expired adoptions CRON handler',
	icon: 'schedule',
	description: 'Adopted probes that are offline for >30 days are deleted.',
	overview: () => [],
	options: [],
});
