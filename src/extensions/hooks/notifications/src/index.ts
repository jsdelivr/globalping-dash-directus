import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import Joi from 'joi';
import { type NotificationTypeKey, joiNotificationTypeKey, mapNotificationTypeKey } from '../../../lib/src/notification-types.js';
import { getEmailStatus, getShouldSend } from './actions/status.js';
import { getOrgAdmins, getOrgMember } from './repositories/directus.js';
import type { NotificationPayload, User } from './types.js';

const UserNotFoundError = createError('NOT_FOUND', 'User for notification not found.', 404);

const AccountNotFoundError = createError('NOT_FOUND', 'Account for notification not found.', 404);

const CancelNotificationError = createError('CANCELLED', 'Notification cancelled by user preferences.', 202);

const ForeignRecipientError = createError('INVALID_PAYLOAD_ERROR', 'The recipient does not belong to the account.', 400);

const notificationPayloadSchema = Joi.object({
	type: joiNotificationTypeKey.required(),
	subject: Joi.string().required(),
	message: Joi.string().required(),
	// A notification is addressed to a specific user directly (recipient), or to the owner of an item (account).
	// Both together mean the sender picked one member of that account itself - send only to that member.
	recipient: Joi.string(),
	account: Joi.string(),
}).or('recipient', 'account').unknown(true);

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

			delete payload.account;

			// The sender picked one member of the org itself.
			if (account.org && value.recipient) {
				return notifyOrgMember(account.org, value.recipient, payload, type);
			}

			// If account is personal and recipient is not the account owner, it's a mistake of the sender.
			if (value.recipient && value.recipient !== account.user) {
				throw new ForeignRecipientError();
			}

			// The notification goes to every admin of the org.
			if (account.org) {
				await notifyOrgAdmins(account.org, payload, type);
				throw new CancelNotificationError();
			}

			payload.recipient = account.user!;
			value.recipient = account.user!;
		}

		return notifyRecipient(value.recipient, payload, type);
	});

	const notifyRecipient = async (recipient: string, payload: NotificationPayload, type: NotificationTypeKey) => {
		const usersService = new UsersService({
			schema: await getSchema(),
		});

		const user = await usersService.readOne(recipient) as User | null;

		if (!user) {
			throw new UserNotFoundError();
		}

		if (!getShouldSend(type, user)) {
			throw new CancelNotificationError();
		}

		return { ...payload, email_status: getEmailStatus(type, user) };
	};

	const notifyOrgMember = async (orgId: string, recipient: string, payload: NotificationPayload, type: NotificationTypeKey) => {
		const member = await getOrgMember(orgId, recipient, hookContext);

		if (!member) {
			throw new CancelNotificationError();
		}

		const user: User = { email: member.user.email, notification_preferences: member.notification_preferences };

		if (!getShouldSend(type, user)) {
			throw new CancelNotificationError();
		}

		return { ...payload, email_status: getEmailStatus(type, user) };
	};

	// Org notifications go to the org admins only, each per their own org notification preferences.
	const notifyOrgAdmins = async (orgId: string, payload: NotificationPayload, type: NotificationTypeKey) => {
		const notificationsService = new NotificationsService({ schema: await getSchema() });
		const admins = await getOrgAdmins(orgId, hookContext);

		for (const admin of admins) {
			const user: User = { email: admin.user.email, notification_preferences: admin.notification_preferences };

			if (!getShouldSend(type, user)) {
				continue;
			}

			await notificationsService.createOne({
				...payload,
				recipient: admin.user.id,
				email_status: getEmailStatus(type, user),
			}, { emitEvents: false });
		}
	};
});
