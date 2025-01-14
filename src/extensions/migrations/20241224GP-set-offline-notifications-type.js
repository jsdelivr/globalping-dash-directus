export async function up (knex) {
	await knex('directus_notifications').where({ subject: 'Your probe went offline' }).update({ type: 'offline_probe' });

	console.log('Set offline notifications type to "offline_probe".');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
