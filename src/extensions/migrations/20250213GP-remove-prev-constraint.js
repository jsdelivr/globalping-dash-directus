export async function up (knex) {
	const probesTableExists = await knex.schema.hasTable('gp_adopted_probes');

	if (!probesTableExists) {
		console.log('Old collection do not exist, removing of a constraint is not required.');
		return;
	}

	await knex.raw(`ALTER TABLE gp_credits_additions DROP FOREIGN KEY gp_credits_additions_adopted_probe_foreign`);

	console.log('Removed previous constaint');
}

export async function down () {
	console.log('There is no down operation for this migration.');
}
