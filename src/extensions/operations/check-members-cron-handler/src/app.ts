import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'check-members-cron-handler',
	name: 'Check org members CRON handler',
	icon: 'schedule',
	description: 'Removes memberships of users who left the org.',
	overview: () => [],
	options: [],
});
