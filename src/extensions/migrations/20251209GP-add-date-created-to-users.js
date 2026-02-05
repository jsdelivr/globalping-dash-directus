export async function up (knex) {
	await knex.raw(`
        UPDATE directus_users u
        SET date_created = LEAST(
                COALESCE((SELECT MIN(date_created) FROM gp_probes WHERE userId = u.id), NOW()),
                COALESCE((SELECT MIN(timestamp) FROM directus_notifications WHERE recipient = u.id), NOW()),
                COALESCE(
					IF(u.provider = 'github',
						(SELECT MIN(date_created) FROM gp_credits_additions WHERE github_id = u.external_identifier),
						NULL
					),
					NOW()
                )
			)
		WHERE date_created IS NULL
	`);

	console.log('Backfilled missing users\' date_created field.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
