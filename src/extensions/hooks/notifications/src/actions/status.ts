import { type NotificationTypeKey, areAllDisabled, areAllEmailsDisabled, getNotificationType } from '../../../../lib/src/notification-types.js';
import type { NotificationPayload, User } from '../types.js';

export const getShouldSend = (type: NotificationTypeKey, user: User): boolean => {
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
	const allDisabled = areAllDisabled(notificationPreferences);

	if (typeof userEnabled === 'boolean') {
		return userEnabled;
	}

	if (allDisabled) {
		return false;
	}

	return true;
};

export const getEmailStatus = (type: NotificationTypeKey, user: User): NotificationPayload['email_status'] => {
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
	const allEmailsDisabled = areAllEmailsDisabled(notificationPreferences);

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
