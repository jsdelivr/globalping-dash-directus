import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { type NotificationTypeKey, joiNotificationTypeKey, mapNotificationTypeKey } from '../../../lib/src/notification-types.js';
import { getEmailStatus, getShouldSend } from './actions/status.js';
import { getOrgAdmins } from './repositories/directus.js';
import type { NotificationPayload, User } from './types.js';

const UserNotFoundError = createError('NOT_FOUND', 'User for notification not found.', 404);

const AccountNotFoundError = createError('NOT_FOUND', 'Account for notification not found.', 404);

const CancelNotificationError = createError('CANCELLED', 'Notification cancelled by user preferences.', 202);

const notificationPayloadSchema = Joi.object({
	type: joiNotificationTypeKey.required(),
	subject: Joi.string().required(),
	message: Joi.string().required(),
	// A notification is addressed either to a specific user directly, or to the owner of an item (a user or an org).
	recipient: Joi.string(),
	// The account of the item the notification is about; resolved into recipient(s) by this hook, never stored.
	account: Joi.string(),
}).xor('recipient', 'account').unknown(true);

export default defineHook(({ filter }, hookContext) => {
	const { services, getSchema } = hookContext;
	const { UsersService, NotificationsService } = services;

	filter('notifications.create', async (payload: NotificationPayload, _meta, context) => {
		const { error, value } = notificationPayloadSchema.validate(payload);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		const type = mapNotificationTypeKey(value.type)!;

		if (value.account) {
			const account = await context.database('gp_accounts').where({ id: value.account }).first('user', 'org');

			if (!account) {
				throw new AccountNotFoundError();
			}

			if (account.org) {
				await notifyOrgAdmins(account.org, value, type);
				throw new CancelNotificationError();
			}

			payload.recipient = account.user!;
			value.recipient = account.user!;
			delete payload.account;
		}

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

	// Org notifications go to the org admins only, each per their own org notification preferences.
	const notifyOrgAdmins = async (orgId: string, value: NotificationPayload, type: NotificationTypeKey) => {
		const notificationsService = new NotificationsService({ schema: await getSchema() });
		const admins = await getOrgAdmins(orgId, hookContext);

		for (const admin of admins) {
			const user: User = { email: admin.user.email, notification_preferences: admin.notification_preferences };

			if (!getShouldSend(type, user)) {
				continue;
			}

			await notificationsService.createOne({
				recipient: admin.user.id,
				type: value.type,
				subject: value.subject,
				message: value.message,
				email_status: getEmailStatus(type, user),
			}, { emitEvents: false });
		}
	};
});
