import { updateIsOutdatedColumn } from '../migration-utils/is-outdated.js';

export async function up (knex) {
	await updateIsOutdatedColumn(knex);
	console.log('Added isOutdated column to gp_probes.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
