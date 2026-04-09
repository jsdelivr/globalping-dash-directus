import { defineHook } from '@directus/extensions-sdk';
import { getEmailService } from './email-sender.js';

export default defineHook(({ action }, context) => {
	if (!context.env.RESEND_API_KEY) {
		return;
	}

	const emailService = getEmailService(context);

	action('server.start', async () => {
		emailService.scheduleSend();
	});

	action('server.stop', async () => {
		emailService.unscheduleSend();
	});
});
