import { defineHook } from '@directus/extensions-sdk';
import { getEmailService } from './email-sender.js';

export default defineHook(({ action }, context) => {
	const emailService = getEmailService(context);

	action('server.start', async () => {
		if (!context.env.RESEND_API_KEY) {
			return;
		}

		emailService.scheduleSend();
	});

	action('server.stop', async () => {
		emailService.unscheduleSend();
	});
});
