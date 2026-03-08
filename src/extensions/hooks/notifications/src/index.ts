import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { type NotificationTypeKey, notificationTypeKeys, getNotificationType } from '../../../lib/src/notification-types.js';

type User = {
	email?: string | null;
	notification_preferences: Partial<Record<NotificationTypeKey, {
		enabled: boolean;
		emailEnabled: boolean;
	}>> | null;
};

type NotificationPayload = {
	type: NotificationTypeKey;
	recipient: string;
	subject: string;
	message?: string;
};

const UserNotFoundError = createError('NOT_FOUND', 'User for notification not found.', 404);

const CancelNotificationError = createError('CANCELLED', 'Notification cancelled by user preferences.', 204);

const notificationPayloadSchema = Joi.object({
	type: Joi.string().valid(...notificationTypeKeys).required(),
	recipient: Joi.string().required(),
}).unknown(true);

export default defineHook(({ filter, action }, context) => {
	const { services, getSchema } = context;
	const { UsersService, MailService } = services;

	filter('notifications.create', async (payload: NotificationPayload) => {
		const { error, value } = notificationPayloadSchema.validate(payload);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		const { type, recipient } = value as { type: NotificationTypeKey; recipient: string };

		const notification = getNotificationType(type);

		// Skip all checks for one-time notifications.
		if (notification.skipChecks) {
			return payload;
		}

		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(recipient) as User | null;

		if (!user) {
			throw new UserNotFoundError();
		}

		const notificationPreferences = user.notification_preferences ?? {};

		const userEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.enabled : null;
		const userHasDisabledTypes = (Object.keys(notificationPreferences) as Array<NotificationTypeKey>)
			.some(key => !notificationPreferences[key]!.enabled);

		let shouldSend: boolean;

		if (user.notification_preferences === null) {
			shouldSend = true;
		} else if (typeof userEnabled === 'boolean') {
			shouldSend = userEnabled;
		} else if (userHasDisabledTypes) {
			shouldSend = false;
		} else {
			shouldSend = true;
		}

		if (!shouldSend) {
			throw new CancelNotificationError();
		}

		return payload;
	});

	action('notifications.create', async (meta) => {
		const payload = meta.payload as NotificationPayload;
		const recipient = payload.recipient;
		const type = payload.type;
		const notification = getNotificationType(type);

		if (!notification.allowEmail) {
			return;
		}

		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(recipient);

		if (!user?.email) {
			return;
		}

		const notificationPreferences = user.notification_preferences ?? {};

		const userEmailEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.emailEnabled : null;
		const userHasDisabledEmailTypes = (Object.keys(notificationPreferences) as Array<NotificationTypeKey>)
			.some(key => !notificationPreferences[key]!.emailEnabled);

		let shouldSendEmail: boolean;

		if (notification.skipChecks) {
			shouldSendEmail = true;
		} else if (user.notification_preferences === null) {
			shouldSendEmail = true;
		} else if (typeof userEmailEnabled === 'boolean') {
			shouldSendEmail = userEmailEnabled;
		} else if (userHasDisabledEmailTypes) {
			shouldSendEmail = false;
		} else {
			shouldSendEmail = true;
		}

		if (!shouldSendEmail) {
			return;
		}

		const mailService = new MailService({
			schema: await getSchema(),
		});

		await mailService.send({
			to: user.email,
			subject: payload.subject,
			text: payload.message ?? '',
		});
	});
});
