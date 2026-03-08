export const userNotificationTypes = {
	probe_reassigned: {
		enabled: true,
		sendByEmail: true,
	},
	probe_deleted: {
		enabled: true,
		sendByEmail: false,
	},
	probe_offline: {
		enabled: false,
		sendByEmail: false,
	},
};

export const notificationTypes = {
	probe_adopted: {
		defaultEnabled: true,
		description: 'Probe was adopted.',
		sendByEmail: false,
	},
	probe_reassigned: {
		defaultEnabled: true,
		description: 'Probe was reassigned to another user.',
		sendByEmail: true,
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		defaultEnabled: true,
		description: 'Probe has an outdated software.',
		sendByEmail: false,
	},
	probe_deleted: {
		defaultEnabled: true,
		description: 'Probe was unassigned.',
		sendByEmail: true,
	},
	probe_offline: {
		defaultEnabled: true,
		description: 'Probe went offline.',
		sendByEmail: false,
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		defaultEnabled: true,
		description: 'Probe location changed.',
		sendByEmail: false,
	},
};
