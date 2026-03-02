export async function up (knex) {
	await knex.raw(`
		ALTER TABLE gp_probes
		DROP CONSTRAINT IF EXISTS gp_probes_ip_offline_check;
	`);

	await knex.raw(`
		ALTER TABLE gp_probes
		ADD CONSTRAINT gp_probes_ip_offline_check
		CHECK (status = 'offline' OR ip IS NOT NULL);
	`);

	console.log('Check gp_probes_ip_offline_check created: ip can be null only when status is offline');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
