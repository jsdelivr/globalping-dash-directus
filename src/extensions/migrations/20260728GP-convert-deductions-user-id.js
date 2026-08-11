// An org deduction has no user, so this column has to accept NULL. Directus can't make it so on an existing database: it rewrites a
// char column as varchar whenever it alters one, which turns the change into a type change, and that is rejected on a foreign key
// column. Converting the type here first leaves the snapshot with a plain nullability change.
export async function up (knex) {
	const { user_id: userId } = await knex('gp_credits_deductions').columnInfo();

	if (userId.type !== 'char') {
		console.log('gp_credits_deductions.user_id is already varchar');
		return;
	}

	await knex.raw(`ALTER TABLE gp_credits_deductions DROP FOREIGN KEY gp_credits_deductions_user_id_foreign;`);
	await knex.raw(`ALTER TABLE gp_credits_deductions MODIFY user_id VARCHAR(36) ${userId.nullable ? 'NULL' : 'NOT NULL'};`);

	await knex.raw(`
		ALTER TABLE gp_credits_deductions ADD CONSTRAINT gp_credits_deductions_user_id_foreign
		FOREIGN KEY (user_id) REFERENCES directus_users (id) ON DELETE CASCADE ON UPDATE RESTRICT;
	`);

	console.log('gp_credits_deductions.user_id converted to varchar');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
