import { FLOW_ID } from './20231213GP-add-adopted-probes-status-cron-handler.js';

export async function up (knex) {
	await knex('directus_operations').where({ type: 'adopted-probes-status-cron-handler' }).update({
		name: 'Probes status CRON handler',
		key: 'probes_status_cron_handler',
		type: 'probes-status-cron-handler',
	});

	await knex('directus_flows').where({ id: FLOW_ID }).update({
		name: 'Probes status CRON',
		description: 'Checks online status of the probes',
	});

	console.log('Renamed probe status check operation');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
