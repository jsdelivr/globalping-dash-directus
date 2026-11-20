export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_credits_additions ADD INDEX github_id_and_date_created_index (github_id, date_created DESC);`);

	console.log('Indexes added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
