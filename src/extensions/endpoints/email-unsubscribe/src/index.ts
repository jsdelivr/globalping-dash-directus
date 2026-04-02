import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request } from 'express';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getEmailLinks } from '../../../lib/src/email-links.js';
import { configurableNotificationTypes, type NotificationTypeKey } from '../../../lib/src/notification-types.js';

type NotificationPreference = {
	enabled: boolean;
	emailEnabled?: boolean;
};

type NotificationPreferences = Partial<Record<NotificationTypeKey, NotificationPreference>>;

type User = {
	id: string;
	notification_preferences: NotificationPreferences | null;
};

const InvalidPayloadError = createError('INVALID_PAYLOAD_ERROR', 'data is required.', 400);
const InvalidTokenError = createError('INVALID_TOKEN', 'Invalid token.', 400);
const UserNotFoundError = createError('NOT_FOUND', 'User not found.', 404);

export default defineEndpoint((router, context) => {
	const unsubscribeByData = async (req: Request) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const emailLinks = getEmailLinks(context);
		const tokenPayload = emailLinks.verifyToken(data);
		const userId = tokenPayload?.userId ?? null;

		if (!userId) {
			throw new InvalidTokenError();
		}

		const { UsersService } = context.services;
		const usersService = new UsersService({
			schema: await context.getSchema(),
		});
		const user = await usersService.readOne(userId, {
			fields: [ 'id', 'notification_preferences' ],
		}) as User | null;

		if (!user) {
			throw new UserNotFoundError();
		}

		const userPreferences: NotificationPreferences = user.notification_preferences ?? {};
		const configuredTypes = Object.keys(userPreferences) as Array<NotificationTypeKey>;
		const allDisabled = configuredTypes.length > 0 && configuredTypes.every(type => userPreferences[type]!.enabled === false);

		const updatedPreferences = { ...userPreferences };

		for (const type of configurableNotificationTypes as NotificationTypeKey[]) {
			const current = userPreferences[type];
			updatedPreferences[type] = {
				enabled: typeof current?.enabled === 'boolean' ? current.enabled : !allDisabled,
				emailEnabled: false,
			};
		}

		await usersService.updateOne(userId, {
			notification_preferences: updatedPreferences,
		});
	};

	router.post('/list-unsubscribe', asyncWrapper(async (req, res) => {
		await unsubscribeByData(req);
		res.status(204).send();
	}, context));

	router.get('/list-unsubscribe', asyncWrapper(async (req, res) => {
		await unsubscribeByData(req);
		res.redirect(`${context.env.DASH_URL}/emails/success`);
	}, context));
});
