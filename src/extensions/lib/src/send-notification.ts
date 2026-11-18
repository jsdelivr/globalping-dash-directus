import type { ApiExtensionContext } from '@directus/extensions';
import type { NotificationTypeKey } from './notification-types.js';

type NotificationContent = {
	type: NotificationTypeKey;
	subject: string;
	message: string;
	secondary_type?: string;
	collection?: string;
	item?: string;
	metadata?: unknown;
};

// A notification can be sent to:
// - user (recipient)
// - owner of a personal account or admins of an org account (account_id)
// - specific member of an org (account_id + recipient)
type Notification =
	| NotificationContent & { recipient: string }
	| NotificationContent & { account_id: string }
	| NotificationContent & { account_id: string; recipient: string };

// The notifications hook cancels a create by throwing; for the sender that is a success, not an error.
const isCancelled = (error: unknown) => (error as { code?: string }).code === 'CANCELLED';

export const sendNotification = async (notification: Notification, { services, getSchema }: ApiExtensionContext, knex?: ApiExtensionContext['database']) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema(),
		...knex && { knex },
	});

	try {
		await notificationsService.createOne(notification);
	} catch (error) {
		if (!isCancelled(error)) {
			throw error;
		}
	}
};
