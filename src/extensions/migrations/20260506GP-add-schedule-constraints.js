export async function up (knex) {
	await knex.schema.alterTable('gp_schedule', (table) => {
		table.check(`mode IN ('batch', 'stream')`, undefined, 'gp_schedule_mode_check');
	});

	await knex.schema.alterTable('gp_schedule_configuration', (table) => {
		table.check(`measurement_type IN ('http', 'dns', 'ping', 'traceroute', 'mtr')`, undefined, 'gp_schedule_configuration_type_check');
		table.unique([ 'schedule_id', 'name' ], { indexName: 'gp_schedule_configuration_unique_name' });
	});

	console.log('Schedule constraints created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
