export async function up (knex) {
	await knex.raw(`
		ALTER TABLE gp_apps_approvals
		ADD CONSTRAINT unique_user_app UNIQUE (user, app);
	`);

	console.log('Constraint for uniq user+app for gp_apps_approvals added.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
