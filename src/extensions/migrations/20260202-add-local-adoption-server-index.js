export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_probes DROP INDEX IF EXISTS gp_probes_localadoptionserver_index;`);
	await knex.raw(`ALTER TABLE gp_probes ADD INDEX gp_probes_localadoptionserver_index (localAdoptionServer(10));`);

	console.log('Index gp_probes_localadoptionserver_index added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}

