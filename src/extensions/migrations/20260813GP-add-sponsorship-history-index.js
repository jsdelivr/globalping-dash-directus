export async function up (knex) {
	await knex.schema.alterTable('gp_credits_additions', (table) => {
		table.index([ 'reason', 'date_created' ], 'gp_credits_additions_reason_date_created_index');
	});

	console.log('Index gp_credits_additions_reason_date_created_index added');
}

export async function down (knex) {
	await knex.schema.alterTable('gp_credits_additions', (table) => {
		table.dropIndex([ 'reason', 'date_created' ], 'gp_credits_additions_reason_date_created_index');
	});

	console.log('Index gp_credits_additions_reason_date_created_index removed');
}
