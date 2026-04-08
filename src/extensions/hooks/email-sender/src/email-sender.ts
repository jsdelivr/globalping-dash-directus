import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import type { HookExtensionContext } from '@directus/extensions';
import markdownit from 'markdown-it';
import { Resend } from 'resend';
import sanitizeHtml from 'sanitize-html';
import { type EmailGenerator, getEmailGenerator } from '../../../lib/src/email-generator.js';

type NotificationRow = {
	id: number;
	recipient: string;
	subject: string;
	message: string | null;
	email: string;
	type: string;
};

const md = markdownit();

export class EmailService {
	private readonly EMAIL_FROM = 'Globalping <dash@notify.globalping.io>';
	private readonly REPLY_TO = 'd@globalping.io';
	private readonly SEND_INTERVAL = 10_000;
	private readonly BATCH_SIZE = 100;
	private readonly client: Resend;
	private readonly emailGenerator: EmailGenerator;
	private timer: NodeJS.Timeout | undefined;
	private stopped = true;

	public constructor (private readonly context: HookExtensionContext) {
		const { env } = context;

		if (!env.RESEND_API_KEY) {
			throw new Error('RESEND_API_KEY is not set.');
		}

		this.client = new Resend(env.RESEND_API_KEY);
		this.emailGenerator = getEmailGenerator(context);
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
					this.context.logger.error(error);
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
					'notifications.recipient',
					'notifications.type',
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

		const { sentIds, failedIds } = await this.sendEmails(notifications);
		sentIds.length > 0 && await this.context.database('directus_notifications').whereIn('id', sentIds).update({ email_status: 'sent' });
		failedIds.length > 0 && await this.context.database('directus_notifications').whereIn('id', failedIds).update({ email_status: 'failed' });

		return notifications.length;
	}

	private async sendEmails (notifications: NotificationRow[]) {
		const payload = notifications.map(notification => ({
			from: this.EMAIL_FROM,
			to: [ notification.email ],
			subject: notification.subject,
			html: this.formatMessage(notification),
			replyTo: this.REPLY_TO,
			headers: {
				'List-Unsubscribe': `<${this.emailGenerator.generateListUnsubscribeLink(notification.recipient)}>`,
				'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
			},
		}));
		const idempotencyKey = this.getIdempotencyKey(notifications);

		for (let attempt = 0; attempt <= 1; attempt++) {
			const result = await this.client.batch.send(payload, {
				idempotencyKey,
				batchValidation: 'permissive',
			});

			if (!result.error) {
				const errors = result.data.errors ?? [];
				const failedIndexSet = new Set(errors.map(({ index }) => index));
				const failedIds = notifications.filter((_notification, index) => failedIndexSet.has(index)).map(({ id }) => id);
				const sentIds = notifications.filter((_notification, index) => !failedIndexSet.has(index)).map(({ id }) => id);

				return { sentIds, failedIds };
			} else if (result.error.statusCode === 429 && attempt < 1) {
				const retryAfter = Number(result.headers?.['retry-after']);
				const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000;
				await wait(delay);
			} else {
				throw new Error(result.error.message);
			}
		}

		throw new Error('Failed to send email batch.');
	}

	private getIdempotencyKey (notifications: NotificationRow[]) {
		const ids = notifications.map(({ id }) => id).join(',');
		const hash = createHash('sha1').update(ids).digest('hex');
		return `notifications-batch/${hash}`;
	}

	private formatMessage (notification: NotificationRow) {
		const renderedMessage = md.render(notification.message ?? '');
		const messagesWithAbsoluteLinks = renderedMessage.replaceAll(/href="(\/[^"]*)"/g, (_match, link: string) => `href="${this.context.env.DASH_URL}${link}"`);
		const typeTitle = notification.type.replace('_', '\u00A0').replace(/^./, c => c.toUpperCase());
		const messageWithFooter = messagesWithAbsoluteLinks
			+ '<p>—<br>'
			+ `<a href="${this.emailGenerator.generateSettingsLink()}">Manage notifications</a> | `
			+ `<a href="${this.emailGenerator.generateTypeUnsubscribeLink(notification.recipient, notification.type)}">Disable "${typeTitle}" emails</a>`
			+ '</p>';
		return sanitizeHtml(messageWithFooter);
	}
}

let emailService: EmailService | null = null;

export const getEmailService = (context: HookExtensionContext) => {
	if (!emailService) {
		emailService = new EmailService(context);
	}

	return emailService;
};
