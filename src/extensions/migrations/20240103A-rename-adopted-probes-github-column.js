export async function up (knex) {
	const columnExists = await knex.schema.hasColumn('directus_users', 'github');

	if (!columnExists) {
		console.log('"directus_users" table or "github" column doesn\'t exist, rename is not required.');
		return;
	}

	await knex.schema.raw('ALTER TABLE `directus_users` RENAME COLUMN `github` TO `github_username`');
	console.log('"github" column successfully renamed');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
