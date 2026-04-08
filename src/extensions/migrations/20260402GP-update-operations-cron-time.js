export async function up (knex) {
	await knex.raw(`
		UPDATE directus_flows f
		INNER JOIN directus_operations o ON o.flow = f.id
		SET f.options = JSON_SET(COALESCE(f.options, JSON_OBJECT()), '$.cron', '0 15 * * *')
		WHERE o.key IN ('remove_expired_adoptions_cron_handler', 'check_outdated_firmware_cron_handler')
	`);

	console.log('Updated cron for expired adoptions and outdated firmware handlers');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
