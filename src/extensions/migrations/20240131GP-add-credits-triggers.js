export async function up (knex) {
	await knex.raw(`
		ALTER TABLE gp_credits
		ADD CONSTRAINT gp_credits_amount_positive CHECK (amount >= 0);
	`);

	await knex.raw(`
		ALTER TABLE gp_credits_additions
		ADD CONSTRAINT gp_credits_additions_amount_positive CHECK (amount >= 0);
	`);

	await knex.raw(`
		ALTER TABLE gp_credits_deductions
		ADD CONSTRAINT gp_credits_deductions_amount_positive CHECK (amount >= 0);
	`);

	console.log('Credits amount constraints added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
