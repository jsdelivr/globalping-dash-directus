export type NotificationTypeKey = keyof typeof notificationTypes;

type NotificationType = {
	ignorePreferences: boolean;
	allowEmail: boolean;
	hasParameter: false;
	description: string;
} | {
	ignorePreferences: boolean;
	allowEmail: boolean;
	hasParameter: true;
	defaultParameter: number;
	description: string;
};

const notificationTypes = {
	welcome: {
		ignorePreferences: true,
		allowEmail: false,
		hasParameter: false,
		description: 'Welcome to Globalping message.',
	},
	probe_adopted: {
		ignorePreferences: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe successfully adopted',
	},
	probe_unassigned: {
		ignorePreferences: false,
		allowEmail: true,
		hasParameter: false,
		description: 'Probe was unassigned',
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		ignorePreferences: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe software is outdated',
	},
	outdated_firmware: 'outdated_software',
	offline_probe: {
		ignorePreferences: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe went offline',
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		ignorePreferences: false,
		allowEmail: false,
		hasParameter: false,
		description: 'Probe location has changed',
	},
	probe_location_changed_back: 'probe_location_changed',
	low_credits: {
		ignorePreferences: false,
		allowEmail: false,
		hasParameter: true,
		defaultParameter: 1000,
		description: 'Credits are running low',
	},
} satisfies Record<string, string | NotificationType>;

export const configurableNotifications = Object.fromEntries((Object.entries(notificationTypes).filter(([ , value ]) => typeof value === 'object' && !value.ignorePreferences) as [string, NotificationType][])
	.map(([ key, value ]) => [ key, {
		allowEmail: value.allowEmail,
		hasParameter: value.hasParameter,
		...value.hasParameter ? { defaultParameter: value.defaultParameter } : {},
		description: value.description,
	}]));

export const allNotificationTypes = Object.keys(notificationTypes);

export const configurableNotificationTypes = Object.keys(configurableNotifications);

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
