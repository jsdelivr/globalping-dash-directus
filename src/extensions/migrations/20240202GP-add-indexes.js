export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_tokens ADD INDEX value_index (value);`);
	await knex.raw(`ALTER TABLE gp_probes ADD INDEX ip_index (ip);`);

	console.log('Indexes added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
