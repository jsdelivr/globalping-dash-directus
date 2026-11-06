export async function up (knex) {
	await knex.raw(`
		UPDATE directus_users u
		SET date_created = LEAST(
				COALESCE((SELECT MIN(p.date_created) FROM gp_probes p JOIN gp_accounts a ON a.id = p.account_id WHERE a.user = u.id), NOW()),
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
