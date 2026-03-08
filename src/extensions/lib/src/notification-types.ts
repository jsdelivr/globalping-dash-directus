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
	welcome: {
		skipChecks: true,
		allowEmail: true,
		description: 'Welcome to Globalping!',
	},
	probe_adopted: {
		skipChecks: false,
		allowEmail: true,
		description: 'Probe was adopted.',
	},
	probe_reassigned: {
		skipChecks: false,
		allowEmail: true,
		description: 'Probe was reassigned to another user.',
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		skipChecks: false,
		allowEmail: true,
		description: 'Probe has an outdated software.',
	},
	probe_deleted: {
		skipChecks: false,
		allowEmail: true,
		description: 'Probe was unassigned.',
	},
	probe_offline: {
		skipChecks: false,
		allowEmail: true,
		description: 'Probe went offline.',
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		skipChecks: false,
		allowEmail: true,
		description: 'Probe location changed.',
	},
};
