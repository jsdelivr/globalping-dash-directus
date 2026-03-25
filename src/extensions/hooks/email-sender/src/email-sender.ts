import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import type { HookExtensionContext } from '@directus/extensions';
import { Resend } from 'resend';

type NotificationRow = {
	id: number;
	subject: string;
	message: string | null;
	email: string;
};

class EmailService {
	private readonly client: Resend;
	private timer: NodeJS.Timeout | undefined;
	private readonly SEND_INTERVAL = 5_000;
	private readonly BATCH_SIZE = 100;
	private stopped = true;

	public constructor (private readonly context: HookExtensionContext) {
		const { env } = context;

		if (!env.RESEND_API_KEY) {
			throw new Error('RESEND_API_KEY is not set.');
		}

		if (!env.EMAIL_FROM) {
			throw new Error('EMAIL_FROM is not set.');
		}

		this.client = new Resend(env.RESEND_API_KEY);
	}

	scheduleSend (delay: number = this.SEND_INTERVAL) {
		this.stopped = false;
		clearTimeout(this.timer);

		this.timer = setTimeout(() => {
			this.handleEmails()
				.then((count) => {
					!this.stopped && this.scheduleSend(count === this.BATCH_SIZE ? 0 : this.SEND_INTERVAL);
				})
				.catch((error: Error) => {
					this.context.logger.error('Error in EmailService.handleEmails()', error);
					!this.stopped && this.scheduleSend(this.SEND_INTERVAL);
				});
		}, delay).unref();
	}

	unscheduleSend () {
		this.stopped = true;
		clearTimeout(this.timer);
	}

	private async handleEmails () {
		const notifications = await this.context.database.transaction(async (trx) => {
			const rows = await trx('directus_notifications as notifications')
				.leftJoin('directus_users as users', 'users.id', 'notifications.recipient')
				.select<NotificationRow[]>([
					'notifications.id',
					'notifications.subject',
					'notifications.message',
					'users.email',
				])
				.where('notifications.email_status', 'pending')
				.whereNotNull('users.email')
				.andWhere((query) => {
					query.whereNull('notifications.email_last_attempt')
						.orWhere('notifications.email_last_attempt', '<=', new Date(Date.now() - 60_000));
				})
				.orderBy('notifications.id', 'asc')
				.limit(this.BATCH_SIZE)
				.forUpdate()
				.skipLocked();

			if (rows.length > 0) {
				await trx('directus_notifications')
					.whereIn('id', rows.map(({ id }) => id))
					.update({ email_last_attempt: new Date() });
			}

			return rows;
		});

		if (notifications.length === 0) {
			return 0;
		}

		await this.sendEmails(notifications);

		await this.context.database('directus_notifications')
			.whereIn('id', notifications.map(({ id }) => id))
			.update({ email_status: 'sent' });

		return notifications.length;
	}

	private async sendEmails (notifications: NotificationRow[]) {
		const payload = notifications.map(notification => ({
			from: this.context.env.EMAIL_FROM,
			to: [ notification.email ],
			subject: notification.subject,
			text: notification.message ?? '',
		}));
		const idempotencyKey = this.getIdempotencyKey(notifications);

		for (let attempt = 0; attempt <= 1; attempt++) {
			const result = await this.client.batch.send(payload, { idempotencyKey });

			if (!result.error) {
				return;
			}

			if (result.error.statusCode === 429 && attempt < 1) {
				const retryAfter = Number(result.headers?.['retry-after']);
				const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
				await wait(delay);
			} else {
				throw new Error(result.error.message);
			}
		}
	}

	private getIdempotencyKey (notifications: NotificationRow[]) {
		const ids = notifications.map(({ id }) => id).join(',');
		const hash = createHash('sha1').update(ids).digest('hex');
		return `notifications-batch/${hash}`;
	}
}

let emailService: EmailService | null = null;

export const getEmailService = (context: HookExtensionContext) => {
	if (!emailService) {
		emailService = new EmailService(context);
	}

	return emailService;
};
