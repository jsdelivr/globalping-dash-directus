import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { type NotificationTypeKey, allNotificationTypes, getNotificationType, mapNotificationTypeKey } from '../../../lib/src/notification-types.js';

type User = {
	email: string | null;
	notification_preferences: Partial<Record<NotificationTypeKey, {
		enabled: boolean;
		emailEnabled?: boolean;
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
	type: Joi.string().valid(...allNotificationTypes).required(),
	recipient: Joi.string().required(),
}).unknown(true);

export default defineHook(({ filter, action }, context) => {
	const { services, getSchema } = context;
	const { UsersService } = services;

	filter('notifications.create', async (payload: NotificationPayload) => {
		const { error, value } = notificationPayloadSchema.validate(payload);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		const { recipient } = value as { type: NotificationTypeKey; recipient: string };
		const type = mapNotificationTypeKey(value.type);
		const notification = getNotificationType(type);

		if (notification.ignorePreferences) {
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
		const configuredTypes = Object.keys(notificationPreferences) as Array<NotificationTypeKey>;

		const userEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.enabled : null;
		const allDisabled = configuredTypes.length > 0 && configuredTypes.every(key => notificationPreferences[key]!.enabled === false);

		let shouldSend: boolean;

		if (user.notification_preferences === null) {
			shouldSend = true;
		} else if (typeof userEnabled === 'boolean') {
			shouldSend = userEnabled;
		} else if (allDisabled) {
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
		const type = mapNotificationTypeKey(payload.type);
		const notification = getNotificationType(type);

		if (!notification.allowEmail) {
			return;
		}

		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(recipient) as User | null;

		if (!user?.email) {
			return;
		}

		const notificationPreferences = user.notification_preferences ?? {};
		const configuredTypes = (Object.keys(notificationPreferences) as Array<NotificationTypeKey>)
			.filter(key => typeof notificationPreferences[key]?.emailEnabled === 'boolean');

		const userEmailEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.emailEnabled : null;
		const allEmailDisabled = configuredTypes.length > 0 && configuredTypes.every(key => notificationPreferences[key]!.emailEnabled === false);

		let shouldSendEmail: boolean;

		if (notification.ignorePreferences) {
			shouldSendEmail = true;
		} else if (user.notification_preferences === null) {
			shouldSendEmail = true;
		} else if (typeof userEmailEnabled === 'boolean') {
			shouldSendEmail = userEmailEnabled;
		} else if (allEmailDisabled) {
			shouldSendEmail = false;
		} else {
			shouldSendEmail = true;
		}

		if (!shouldSendEmail) {
			return;
		}

		const message = payload.message;

		if (message === undefined) {
			throw new (createError('INVALID_PAYLOAD_ERROR', '"message" is required', 400))();
		}

		// const mailService = new MailService({
		// 	schema: await getSchema(),
		// });

		// await mailService.send({
		// 	to: user.email,
		// 	subject: payload.subject,
		// 	text: message,
		// });
	});
});
