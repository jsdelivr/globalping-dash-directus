import { defineHook } from '@directus/extensions-sdk';
import { notificationTypes } from '../../../lib/src/notification-types.js';

export default defineHook(({ filter, action }) => {
	filter('items.create', () => {
		console.log(`notificationTypes`, notificationTypes);
	});
});
