export type NotificationTypeKey = keyof typeof notificationTypes;

type NotificationType = {
	configurableByUser: boolean;
	readOnly: boolean;
	sendEmail: boolean;
	hasParameter: false;
	description: string;
} | {
	configurableByUser: boolean;
	readOnly: boolean;
	sendEmail: boolean;
	hasParameter: true;
	defaultParameter: number;
	description: string;
};

const notificationTypes = {
	welcome: {
		configurableByUser: false, // Does type appear in user notification preferences?
		readOnly: false, // Can user disable "App" notifications for this type?
		sendEmail: false, // Should system try to send email for this type? (Can be disabled by user preferences.)
		hasParameter: false, // Does type have a parameter input?
		description: 'Welcome to Globalping message.',
	},
	probe_adopted: {
		configurableByUser: true,
		readOnly: false,
		sendEmail: false,
		hasParameter: false,
		description: 'Probe successfully adopted',
	},
	probe_unassigned: {
		configurableByUser: true,
		readOnly: false,
		sendEmail: false,
		hasParameter: false,
		description: 'Probe was unassigned',
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		configurableByUser: true,
		readOnly: true,
		sendEmail: true,
		hasParameter: false,
		description: 'Probe software is outdated',
	},
	outdated_firmware: 'outdated_software',
	offline_probe: {
		configurableByUser: true,
		readOnly: false,
		sendEmail: true,
		hasParameter: false,
		description: 'Probe went offline',
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		configurableByUser: true,
		readOnly: false,
		sendEmail: false,
		hasParameter: false,
		description: 'Probe location has changed',
	},
	probe_location_changed_back: 'probe_location_changed',
	// TODO: sending of low_credits notifications is not implemented. Keeping it to document the structure of notifications with parameters.
	// low_credits: {
	// 	configurableByUser: true,
	// 	readOnly: false,
	// 	sendEmail: false,
	// 	hasParameter: true,
	// 	defaultParameter: 1000,
	// 	description: 'Credits are running low',
	// },
} satisfies Record<string, string | NotificationType>;

export const configurableNotifications = Object.fromEntries((Object.entries(notificationTypes).filter(([ , value ]) => typeof value === 'object' && value.configurableByUser) as [string, NotificationType][])
	.map(([ key, value ]) => [ key, {
		readOnly: value.readOnly,
		sendEmail: value.sendEmail,
		hasParameter: value.hasParameter,
		...value.hasParameter ? { defaultParameter: value.defaultParameter } : {},
		description: value.description,
	}]));

export const allNotificationTypes = Object.keys(notificationTypes);

export const configurableNotificationTypes = Object.keys(configurableNotifications);

export const mapNotificationTypeKey = (key: NotificationTypeKey): NotificationTypeKey => {
	const notificationType = notificationTypes[key];

	if (typeof notificationType === 'string') {
		return notificationType as NotificationTypeKey;
	}

	if (!notificationType) {
		throw new Error(`Notification type "${key}" not found.`);
	}

	return key;
};

export const getNotificationType = (key: NotificationTypeKey): NotificationType => {
	const resolvedKey = mapNotificationTypeKey(key);
	const notificationType = notificationTypes[resolvedKey];

	return notificationType as NotificationType;
};

export const getAllDisabled = (notificationPreferences: Record<string, { enabled: boolean; emailEnabled?: boolean }> | null): boolean => {
	const configuredTypes = Object.keys(notificationPreferences ?? {}).filter(key => getNotificationType(key as NotificationTypeKey).readOnly === false);
	return configuredTypes.length > 0 && configuredTypes.every(key => notificationPreferences![key]!.enabled === false);
};

export const getAllEmailsDisabled = (notificationPreferences: Record<string, { enabled: boolean; emailEnabled?: boolean }> | null): boolean => {
	const configuredTypes = Object.values(notificationPreferences ?? {}).filter(preference => typeof preference.emailEnabled === 'boolean');
	return configuredTypes.length > 0 && configuredTypes.every(preference => preference.emailEnabled === false);
};
