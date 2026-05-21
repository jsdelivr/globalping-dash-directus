import { updateIsOutdatedColumn } from '../migration-utils/is-outdated.js';

export async function up (knex) {
	await updateIsOutdatedColumn(knex);
	console.log('Re-created isOutdated triggers in gp_probes for the new TARGET_NODE_VERSION.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
