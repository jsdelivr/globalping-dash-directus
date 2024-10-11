export async function up (knex) {
	const users = await knex('directus_users').select('id');

	const notifications = users.map(user => ({
		recipient: user.id,
		subject: 'Welcome to Globalping 🎉',
		message: 'As a registered user, you have 500 free tests per hour. Get more by hosting probes or sponsoring us and supporting the development of the project!',
	}));

	await knex('directus_notifications').insert(notifications);

	console.log('Sent welcome notifications to all existing users.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
