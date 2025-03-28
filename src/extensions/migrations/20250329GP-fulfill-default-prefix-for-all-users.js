export async function up (knex) {
	const usersWithoutDefaultPrefix = await knex('directus_users').select().where({ default_prefix: '' }).orWhere({ default_prefix: null });

	const updatedUsers = await Promise.all(usersWithoutDefaultPrefix.map(async (user) => {
		return { ...user, default_prefix: user.github_username || '' };
	}));

	for (const user of updatedUsers) {
		await knex('directus_users').where({ id: user.id }).update({ default_prefix: user.default_prefix });
	}

	console.log('Added default tag prefix to every user.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
