import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request } from 'express';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getEmailGenerator } from '../../../lib/src/email-generator.js';
import { getAllDisabled, getDefaultNotificationPreferences, mapNotificationTypeKey, type NotificationTypeKey } from '../../../lib/src/notification-types.js';

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

const InvalidPayloadError = createError('INVALID_PAYLOAD_ERROR', 'data is required.', 400);
const InvalidTokenError = createError('INVALID_TOKEN', 'Invalid token.', 400);
const UserNotFoundError = createError('NOT_FOUND', 'User not found.', 404);

export default defineEndpoint((router, context) => {
	const emailGenerator = getEmailGenerator(context);

	const unsubscribeAllEmails = async (req: Request) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const tokenPayload = emailGenerator.verifyToken<{ userId: string }>(data);
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
		const defaultPreferences = getDefaultNotificationPreferences(userPreferences);
		const updatedPreferences = {
			...defaultPreferences,
			...Object.fromEntries(Object.entries(userPreferences).filter(([ key ]) => mapNotificationTypeKey(key))),
		};
		Object.values(updatedPreferences).forEach((preference) => { preference.emailEnabled = false; });

		await usersService.updateOne(userId, {
			notification_preferences: updatedPreferences,
		});
	};

	const unsubscribeTypeEmails = async (req: Request) => {
		const data = req.query.data;

		if (!data || typeof data !== 'string') {
			throw new InvalidPayloadError();
		}

		const tokenPayload = emailGenerator.verifyToken<{ userId: string; type: string }>(data);

		if (!tokenPayload) {
			throw new InvalidTokenError();
		}

		const userId = tokenPayload.userId;
		const resolvedType = mapNotificationTypeKey(tokenPayload.type);

		if (!resolvedType) {
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
		const allDisabled = getAllDisabled(userPreferences);
		const defaultPreferences = getDefaultNotificationPreferences(userPreferences);

		const current = userPreferences[resolvedType];
		const updatedPreferences = {
			...defaultPreferences,
			...Object.fromEntries(Object.entries(userPreferences).filter(([ key ]) => mapNotificationTypeKey(key))),
			[resolvedType]: {
				enabled: typeof current?.enabled === 'boolean' ? current.enabled : !allDisabled,
				emailEnabled: false,
			},
		};

		await usersService.updateOne(userId, {
			notification_preferences: updatedPreferences,
		});

		return tokenPayload.type;
	};

	router.post('/list-unsubscribe', asyncWrapper(async (req, res) => {
		await unsubscribeAllEmails(req);
		res.status(200).send();
	}, context));

	router.get('/list-unsubscribe', asyncWrapper(async (req, res) => {
		await unsubscribeAllEmails(req);
		res.redirect(`${context.env.DASH_URL}/emails/success`);
	}, context));

	router.get('/type-unsubscribe', asyncWrapper(async (req, res) => {
		const type = await unsubscribeTypeEmails(req);
		res.redirect(`${context.env.DASH_URL}/emails/success?type=${type}`);
	}, context));
});
