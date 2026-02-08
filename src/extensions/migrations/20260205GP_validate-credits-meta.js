export async function up (knex) {
	await knex.raw(`
		ALTER TABLE gp_credits_additions
		DROP CONSTRAINT IF EXISTS adopted_probe_check;
	`);

	await knex.raw(`
		ALTER TABLE gp_credits_additions
		ADD CONSTRAINT adopted_probe_check
		CHECK
			(
				(reason != 'adopted_probe' OR (adopted_probe is null AND JSON_EXTRACT(meta, '$.id') is null) OR (adopted_probe = json_extract(meta, '$.id')))
			AND (reason not in ('one_time_sponsorship', 'recurring_sponsorship', 'tier_changed') OR (json_extract(meta, '$.amountInDollars') is not null))
		);
	`);

	console.log('Check for gp_credits_additions created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
