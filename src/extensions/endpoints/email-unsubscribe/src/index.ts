import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getLinkGenerator } from '../../../lib/src/link-generator.js';
import { configurableNotifications, getDefaultNotificationPreferences, mapNotificationTypeKey, type NotificationTypeKey } from '../../../lib/src/notification-types.js';

type NotificationPreference = {
	enabled: boolean;
	emailEnabled?: boolean;
	parameter?: number;
};

type NotificationPreferences = Partial<Record<NotificationTypeKey, NotificationPreference>>;

type User = {
	id: string;
	notification_preferences: NotificationPreferences | null;
};

type Membership = {
	id: string;
	notification_preferences: NotificationPreferences | null;
};

const InvalidPayloadError = createError('INVALID_PAYLOAD_ERROR', 'data is required.', 400);
const InvalidTokenError = createError('INVALID_TOKEN', 'Invalid token.', 400);

// The preferences with the emails of one type, or of every type, switched off.
const withEmailsDisabled = (preferences: NotificationPreferences | null, type: NotificationTypeKey | null): NotificationPreferences => {
	const current = preferences ?? {};
	const updated: NotificationPreferences = {
		...getDefaultNotificationPreferences(current),
		// Filtering here to remove old types that were removed from notificationTypes.
		...Object.fromEntries(Object.entries(current).filter(([ key ]) => Object.hasOwn(configurableNotifications, key))),
	};

	if (!type) {
		Object.values(updated).forEach((preference) => { preference.emailEnabled = false; });
		return updated;
	}

	updated[type]!.emailEnabled = false;
	return updated;
};

export default defineEndpoint((router, context) => {
	const linkGenerator = getLinkGenerator(context);

	const unsubscribe = async (userId: string, type: NotificationTypeKey | null) => {
		const { UsersService, ItemsService } = context.services;
		const schema = await context.getSchema();

		await context.database.transaction(async (trx) => {
			const usersService = new UsersService({ schema, knex: trx });
			const membersService = new ItemsService('gp_org_members', { schema, knex: trx });

			const user = await usersService.readOne(userId, { fields: [ 'id', 'notification_preferences' ] }) as User;

			await usersService.updateOne(userId, { notification_preferences: withEmailsDisabled(user.notification_preferences, type) });

			const memberships = await membersService.readByQuery({
				filter: { user: { _eq: userId } },
				fields: [ 'id', 'notification_preferences' ],
			}) as Membership[];

			for (const membership of memberships) {
				await membersService.updateOne(membership.id, { notification_preferences: withEmailsDisabled(membership.notification_preferences, type) });
			}
		});
	};

	router.post('/unsubscribe', asyncWrapper(async (req, res) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const tokenPayload = linkGenerator.verifyToken(data, 'email-unsubscribe', true);

		if (!tokenPayload) {
			throw new InvalidTokenError();
		}

		const type = tokenPayload.type ? mapNotificationTypeKey(tokenPayload.type) : null;

		if (tokenPayload.type && !type) {
			throw new InvalidTokenError();
		}

		await unsubscribe(tokenPayload.userId, type);

		res.status(200).send();
	}, context));

	router.get('/unsubscribe', asyncWrapper(async (req, res) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const params = new URLSearchParams({ data }).toString();
		const location = `${context.env.DASH_URL}/emails/unsubscribe?${params}`;
		res.redirect(location);
	}, context));
});
