export type NotificationTypeKey = keyof typeof notificationTypes;

export type NotificationType = {
	skipChecks: boolean;
	allowEmail: boolean;
	hasParameter: boolean;
	description: string;
};

const notificationTypes = {
	welcome: {
		skipChecks: true,
		allowEmail: false,
		hasParameter: false,
		description: 'Welcome to Globalping!',
	},
	probe_adopted: {
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe was adopted.',
	},
	probe_unassigned: {
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe was reassigned to another user.',
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe has an outdated software.',
	},
	outdated_firmware: 'outdated_software',
	probe_deleted: {
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe was unassigned.',
	},
	offline_probe: {
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe went offline.',
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		skipChecks: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe location changed.',
	},
	probe_location_changed_back: 'probe_location_changed',
	low_credits: {
		skipChecks: false,
		allowEmail: false,
		hasParameter: true,
		description: 'Get notification when your credits are low.',
	},
};

export const notificationTypeKeys: Array<NotificationTypeKey> = Object.keys(notificationTypes) as Array<NotificationTypeKey>;

export const getNotificationType = (key: NotificationTypeKey): NotificationType => {
	const notificationType = notificationTypes[key];

	if (typeof notificationType === 'string') {
		return notificationTypes[notificationType as NotificationTypeKey] as NotificationType;
	}

	if (!notificationType) {
		throw new Error(`Notification type "${key}" not found.`);
	}

	return notificationType;
};
