import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'remove-banned-users-cron-handler',
	name: 'Remove banned users CRON handler',
	icon: 'schedule',
	description: 'Handle banned users CRON job. Reads directus users, users not found on github are deleted.',
	overview: () => [],
	options: [],
});
