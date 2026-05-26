// Backfill `low_credits_notified: true` so notifications are sent only for new crossings.
export async function up (knex) {
	const result = await knex('gp_credits')
		.update({ low_credits_notified: true });

	console.log(`Backfilled low_credits_notified=true for ${result} rows.`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
