export async function up (knex) {
	await knex.schema.alterTable('gp_credits_additions', (table) => {
		table.index([ 'reason', 'date_created' ], 'gp_credits_additions_reason_date_created_index');
	});

	console.log('Index gp_credits_additions_reason_date_created_index added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
