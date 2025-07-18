import { assignOperationToFlow, createFlow, createOperation } from '../../src/extensions/migration-utils/flows.js';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	await knex('directus_flows').where('name', 'LIKE', '[DEV]%').delete();
	await knex('directus_operations').where('name', 'LIKE', '[DEV]%').delete();

	await createManualTrigger({
		flow: {
			id: '675f2298-8e04-4f70-855d-acd55d346897',
			name: '[DEV] Adopted probes credits manual flow',
		},
		operation: {
			name: '[DEV] Adopted probes credits manual operation',
			key: 'adopted_probes_credits_manual_handler',
			type: 'adopted-probes-credits-cron-handler',
		},
	});

	await createManualTrigger({
		flow: {
			id: 'f2173a49-8431-4f51-b09f-981395de3f54',
			name: '[DEV] Remove banned users manual flow',
		},
		operation: {
			name: '[DEV] Remove banned users manual operation',
			key: 'remove_banned_users_manual_handler',
			type: 'remove-banned-users-cron-handler',
		},
	});

	await createManualTrigger({
		flow: {
			id: '176fb9aa-ba3c-44c9-97f8-78f1078eb554',
			name: '[DEV] Expired probes manual flow',
		},
		operation: {
			name: '[DEV] Expired adoptions manual operation',
			key: 'remove_expired_adoptions_manual_handler',
			type: 'remove-expired-adoptions-cron-handler',
		},
	});

	await createManualTrigger({
		flow: {
			id: 'c76af4f0-229f-4ec3-a576-32958db2ed44',
			name: '[DEV] Check outdated firmware manual flow',
		},
		operation: {
			name: '[DEV] Check outdated firmware manual operation',
			key: 'check_outdated_firmware_manual_handler',
			type: 'check-outdated-firmware-cron-handler',
		},
	});

	await createManualTrigger({
		flow: {
			id: 'dc4d3f1d-ef46-4fb0-83af-dbcf7e234a27',
			name: '[DEV] Probes status manual flow',
		},
		operation: {
			name: '[DEV] Probes status manual operation',
			key: 'probes_status_manual_handler',
			type: 'probes-status-cron-handler',
		},
	});

	await createManualTrigger({
		flow: {
			id: 'ad6a7af9-dc7d-4c49-8b15-95d063e83592',
			name: '[DEV] Sponsors manual flow',
		},
		operation: {
			name: '[DEV] Sponsors manual operation',
			key: 'sponsorship_manual_handler',
			type: 'sponsors-cron-handler',
		},
	});
};

const createManualTrigger = async (config) => {
	await createFlow(config.flow.id, {
		name: config.flow.name,
		trigger: 'webhook',
		options: {
			return: '$all',
			cacheEnabled: false,
		},
	});

	const operation = await createOperation(config.flow.id, {
		name: config.operation.name,
		key: config.operation.key,
		type: config.operation.type,
	});

	await assignOperationToFlow(config.flow.id, operation.id);
};
