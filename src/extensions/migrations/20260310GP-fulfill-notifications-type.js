export async function up (knex) {
	await knex.transaction(async (trx) => {
		await trx.raw(`
			UPDATE directus_notifications
			SET type = CASE
				WHEN subject = 'Your probe''s location has changed' THEN 'probe_location_changed'
				WHEN subject = 'Your probe''s location has changed back' THEN 'probe_location_changed_back'
				WHEN subject = 'Your probe has been deleted' THEN 'probe_unassigned'
				WHEN subject = 'Your probe is running an outdated firmware' THEN 'outdated_firmware'
				WHEN subject = 'New probe adopted' THEN 'probe_adopted'
				WHEN subject = 'Probe unassigned' THEN 'probe_unassigned'
				WHEN subject = 'Your hardware probe is running an outdated firmware' THEN 'outdated_firmware'
				WHEN subject = 'Your probe container is running an outdated software' THEN 'outdated_software'
			END
			WHERE type IS NULL
				AND (
					subject IN (
						'Your probe''s location has changed',
						'Your probe''s location has changed back',
						'Your probe has been deleted',
						'Your probe is running an outdated firmware',
						'New probe adopted',
						'Probe unassigned',
						'Your hardware probe is running an outdated firmware',
						'Your probe container is running an outdated software'
					)
				)
		`);

		await trx.raw(`
			UPDATE directus_notifications
			SET type = 'welcome'
			WHERE type IS NULL
				AND subject LIKE 'Welcome to Globalping%'
		`);

		const notificationWithNullType = await trx('directus_notifications')
			.whereNull('type')
			.select('subject')
			.first();

		if (notificationWithNullType) {
			throw new Error(`Found directus_notifications rows with NULL type after backfill. Subject: ${notificationWithNullType.subject}`);
		}
	});

	console.log('Backfilled null directus_notifications.type values for known subjects.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
