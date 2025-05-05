export async function up (knex) {
	await knex.raw(`
		UPDATE gp_credits_additions
		SET adopted_probe = JSON_UNQUOTE(JSON_EXTRACT(meta, '$.id'))
		WHERE reason = 'adopted_probe'
	`);

	console.log('Successfully updated gp_credits_additions with adopted_probe values.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
