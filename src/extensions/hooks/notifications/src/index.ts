import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { type NotificationTypeKey, allNotificationTypes, getAllDisabled, getAllEmailsDisabled, mapNotificationTypeKey, getNotificationType } from '../../../lib/src/notification-types.js';

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
	message: string;
	email_status?: 'not-required' | 'no-email' | 'disabled-by-user' | 'pending' | 'sent';
};

const UserNotFoundError = createError('NOT_FOUND', 'User for notification not found.', 404);

const CancelNotificationError = createError('CANCELLED', 'Notification cancelled by user preferences.', 202);

const notificationPayloadSchema = Joi.object({
	type: Joi.string().valid(...allNotificationTypes).required(),
	message: Joi.string().required(),
	recipient: Joi.string().required(),
}).unknown(true);

export default defineHook(({ filter }, context) => {
	const { services, getSchema } = context;
	const { UsersService } = services;

	filter('notifications.create', async (payload: NotificationPayload) => {
		const { error, value } = notificationPayloadSchema.validate(payload);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		const type = mapNotificationTypeKey(value.type)!;

		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(value.recipient) as User | null;

		if (!user) {
			throw new UserNotFoundError();
		}

		const shouldSend = getShouldSend(type, user);

		if (!shouldSend) {
			throw new CancelNotificationError();
		}

		const emailStatus = getEmailStatus(type, user);
		return { ...payload, email_status: emailStatus };
	});
});

const getShouldSend = (type: NotificationTypeKey, user: User): boolean => {
	const notification = getNotificationType(type)!;

	if (!notification.configurableByUser) {
		return true;
	}

	if (notification.readOnly) {
		return true;
	}

	if (user.notification_preferences === null) {
		return true;
	}

	const notificationPreferences = user.notification_preferences;
	const userEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.enabled : null;
	const allDisabled = getAllDisabled(notificationPreferences);

	if (typeof userEnabled === 'boolean') {
		return userEnabled;
	}

	if (allDisabled) {
		return false;
	}

	return true;
};

const getEmailStatus = (type: NotificationTypeKey, user: User): NotificationPayload['email_status'] => {
	const notification = getNotificationType(type)!;

	if (!notification.sendEmail) {
		return 'not-required';
	}

	if (!user?.email) {
		return 'no-email';
	}

	if (user.notification_preferences === null) {
		return 'pending';
	}

	if (!notification.configurableByUser) {
		return 'pending';
	}

	const notificationPreferences = user.notification_preferences;
	const userEmailEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.emailEnabled : null;
	const allEmailsDisabled = getAllEmailsDisabled(notificationPreferences);

	if (userEmailEnabled === true) {
		return 'pending';
	}

	if (userEmailEnabled === false) {
		return 'disabled-by-user';
	}

	if (allEmailsDisabled) {
		return 'disabled-by-user';
	}

	return 'pending';
};
