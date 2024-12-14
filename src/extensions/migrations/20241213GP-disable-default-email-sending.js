export async function up (knex) {
	await knex('directus_users').where({ email_notifications: 1 }).update({ email_notifications: 0 });

	console.log('Disabled default email sending.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
