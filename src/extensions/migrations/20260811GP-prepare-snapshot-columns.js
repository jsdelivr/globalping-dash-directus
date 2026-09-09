// Prepares the columns the snapshot can't change itself: Directus rewrites a char column as varchar whenever it alters one, which
// turns any change into a type change, and that is rejected on a foreign key column. Runs on its own, before the snapshot is
// applied - see the deploy note in phase1.md.
export async function up (knex) {
	// The `user` foreign key is served by the UNIQUE(user, app) index that 20260814GP replaces, so the column needs an index of its
	// own. Also created here because the snapshot marks the column as indexed, which it otherwise can't apply on a char column.
	await knex.raw(`ALTER TABLE gp_apps_approvals ADD INDEX IF NOT EXISTS gp_apps_approvals_user_index (user);`);

	// An org deduction has no user, so gp_credits_deductions.user_id has to accept NULL - through the snapshot, once it is varchar.
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
