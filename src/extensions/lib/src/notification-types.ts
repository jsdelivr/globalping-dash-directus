export const userNotificationTypes = {
	probe_reassigned: {
		enabled: true,
		emailEnabled: true,
	},
	probe_deleted: {
		enabled: true,
		emailEnabled: false,
	},
	probe_offline: {
		enabled: false,
		emailEnabled: false,
	},
};

export const notificationTypes = {
	probe_adopted: {
		allowEmail: true,
		description: 'Probe was adopted.',
	},
	probe_reassigned: {
		allowEmail: true,
		description: 'Probe was reassigned to another user.',
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		allowEmail: true,
		description: 'Probe has an outdated software.',
	},
	probe_deleted: {
		allowEmail: true,
		description: 'Probe was unassigned.',
	},
	probe_offline: {
		allowEmail: true,
		description: 'Probe went offline.',
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		allowEmail: true,
		description: 'Probe location changed.',
	},
};
