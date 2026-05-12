import { defineHook } from '@directus/extensions-sdk';
import { LOW_CREDITS_DEFAULT_THRESHOLD } from '../../../lib/src/notification-types.js';

export default defineHook(({ action }, context) => {
	action('server.start', async () => {
		await context.database('directus_settings')
			.update({ low_credits_default_threshold: LOW_CREDITS_DEFAULT_THRESHOLD });
	});
});
