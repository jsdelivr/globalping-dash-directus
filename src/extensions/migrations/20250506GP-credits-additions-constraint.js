export async function up (knex) {
	await knex.raw(`
		ALTER TABLE gp_credits_additions
		ADD CONSTRAINT adopted_probe_check
		CHECK (reason != 'adopted_probe' OR (adopted_probe is null AND JSON_EXTRACT(meta, '$.id') is null) OR (adopted_probe = json_extract(meta, '$.id')));
	`);

	console.log('Check for gp_credits_additions created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
