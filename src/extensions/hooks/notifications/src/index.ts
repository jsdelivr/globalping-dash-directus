import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { notificationTypes } from '../../../lib/src/notification-types.js';

type NotificationKey = keyof typeof notificationTypes;

type User = {
	notification_preferences: Partial<Record<NotificationKey, {
		enabled: boolean;
		sendByEmail: boolean;
	}>> | null;
};

const UserNotFoundError = createError('NOT_FOUND', 'User for notification not found.', 404);

const CancelNotificationError = createError('CANCELLED', 'Notification cancelled by user preferences.', 204);

const notificationPayloadSchema = Joi.object({
	type: Joi.string().valid(...Object.keys(notificationTypes)).required(),
	recipient: Joi.string().required(),
}).unknown(true);

export default defineHook(({ filter }, context) => {
	const { services, getSchema } = context;
	const { UsersService } = services;

	filter('notifications.create', async (payload: { type?: string; recipient?: string }) => {
		const { error, value } = notificationPayloadSchema.validate(payload);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		const { type, recipient } = value as { type: NotificationKey; recipient: string };

		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(recipient) as User | null;

		if (!user) {
			throw new UserNotFoundError();
		}

		const notificationPreferences = user.notification_preferences ?? {};

		const userEnabled = Object.hasOwn(notificationPreferences, type) ? notificationPreferences[type]!.enabled : null;
		const defaultEnabled = notificationTypes[type].defaultEnabled;
		const userHasDisabledTypes = (Object.keys(notificationPreferences || {}) as Array<NotificationKey>)
			.some(key => notificationPreferences[key]!.enabled && notificationTypes[key].defaultEnabled);

		let shouldSend: boolean;

		if (user.notification_preferences === null) {
			shouldSend = defaultEnabled;
		} else if (typeof userEnabled === 'boolean') {
			shouldSend = userEnabled;
		} else if (userHasDisabledTypes) {
			shouldSend = false;
		} else {
			shouldSend = defaultEnabled;
		}

		if (!shouldSend) {
			throw new CancelNotificationError();
		}

		return payload;
	});
});
