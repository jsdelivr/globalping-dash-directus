import { defineHook } from '@directus/extensions-sdk';
import { getEmailService } from './email-sender.js';

export default defineHook(({ action }, context) => {
	action('server.start', async () => {
		const emailService = getEmailService(context);
		emailService.scheduleSend();
	});

	action('server.stop', async () => {
		const emailService = getEmailService(context);
		emailService.unscheduleSend();
	});
});
