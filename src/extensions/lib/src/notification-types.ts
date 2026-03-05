export const notificationTypes = {
	probe_adopted: {
		defaultEnabled: true,
		description: 'Probe was adopted.',
		sentByEmail: false,
	},
	probe_reassigned: {
		defaultEnabled: true,
		description: 'Probe was reassigned to another user.',
		sentByEmail: false,
	},
	outdated_software: { // Also controls 'outdated_firmware'.
		defaultEnabled: true,
		description: 'Probe has an outdated software.',
		sentByEmail: false,
	},
	probe_deleted: {
		defaultEnabled: true,
		description: 'Probe was unassigned.',
		sentByEmail: false,
	},
	probe_offline: {
		defaultEnabled: true,
		description: 'Probe went offline.',
		sentByEmail: false,
	},
	probe_location_changed: { // Also controls 'probe_location_changed_back'.
		defaultEnabled: true,
		description: 'Probe location changed.',
		sentByEmail: false,
	},
};
