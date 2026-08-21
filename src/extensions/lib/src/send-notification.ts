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

// A notification is addressed either to a specific user, or to the account owning the item it is about - never to both.
type Notification =
	| NotificationContent & { recipient: string; account?: never }
	| NotificationContent & { account: string; recipient?: never };

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
