import type { NotificationTypeKey } from '../../../lib/src/notification-types.js';

export type User = {
	email: string | null;
	notification_preferences: Partial<Record<NotificationTypeKey, {
		enabled: boolean;
		emailEnabled?: boolean;
	}>> | null;
};

export type NotificationPayload = {
	type: NotificationTypeKey;
	// PHASE4: drop the recipient field, account becomes required.
	recipient?: string;
	account?: string;
	subject: string;
	message: string;
	email_status?: 'not-required' | 'no-email' | 'disabled-by-user' | 'pending' | 'sent';
};

export type OrgAdmin = {
	user: {
		id: string;
		email: string | null;
	};
	notification_preferences: User['notification_preferences'];
};
