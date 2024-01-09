export async function up (knex) {
	const probesTableExists = await knex.schema.hasTable('adopted_probes');
	const usersTableExists = await knex.schema.hasTable('directus_users');

	if (!probesTableExists || !usersTableExists) {
		console.log('Required tables do not exist, operation is not required.');
		return;
	}

	const rows = await knex('adopted_probes')
		.join('directus_users', 'adopted_probes.userId', '=', 'directus_users.id')
		.select('adopted_probes.id', 'adopted_probes.tags', 'directus_users.github_username');

	for (let row of rows) {
		if (row.tags) {
			try {
				let tags = JSON.parse(row.tags);
				let updatedTags = tags.map(tag => typeof tag === 'string' ? { prefix: row.github_username, value: tag } : tag);
				await knex('adopted_probes')
					.where({ id: row.id })
					.update({ tags: JSON.stringify(updatedTags) });
			} catch (err) {
				console.error(`Error parsing JSON for row id ${row.id}:`, err);
			}
		}
	}

	console.log('Completed migrating "tags" column in "adopted_probes" table');
}

export async function down () {
	console.log('There is no down operation for this migration.');
}
