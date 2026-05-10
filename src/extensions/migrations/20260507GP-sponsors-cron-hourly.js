export async function up (knex) {
	await knex.raw(`
		UPDATE directus_flows f
		INNER JOIN directus_operations o ON o.flow = f.id
		SET f.options = JSON_SET(COALESCE(f.options, JSON_OBJECT()), '$.cron', '0 * * * *')
		WHERE o.key = 'sponsorship_cron_handler'
	`);

	console.log('Updated sponsors cron handler to run every hour');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
