export async function up (knex) {
	await knex.raw(`ALTER TABLE directus_notifications ADD INDEX email_status_index (email_status);`);
	console.log('Index "email_status_index" added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
