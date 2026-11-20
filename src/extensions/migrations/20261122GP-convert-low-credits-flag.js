// Converts the old '0'/'1' flag of the account owner in `low_credits_notified` to the list of the notified users.
export async function up (knex) {
	// A string compare: a number compare fails on the '[]' rows in strict mode.
	await knex.raw(`
		UPDATE gp_credits c
		JOIN gp_accounts a ON a.id = c.account_id
		SET c.low_credits_notified = JSON_ARRAY(a.user)
		WHERE c.low_credits_notified = '1' AND a.user IS NOT NULL
	`);

	await knex.raw(`
		UPDATE gp_credits
		SET low_credits_notified = '[]'
		WHERE low_credits_notified IN ('0', '1')
	`);

	console.log('Converted low_credits_notified flags to lists.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
