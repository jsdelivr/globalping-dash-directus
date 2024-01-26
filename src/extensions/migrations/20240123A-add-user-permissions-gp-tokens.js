export async function up (knex) {
	const rowsToCopy = await knex.select('role', 'action', 'permissions', 'fields')
		.from('directus_permissions')
		.where('collection', 'jsd_purge_tokens');

	const newRows = rowsToCopy.map((row) => {
		return {
			role: row.role,
			action: row.action,
			permissions: row.permissions,
			fields: row.fields,
			collection: 'gp_tokens',
		};
	});

	await knex('directus_permissions').insert(newRows);

	console.log('Added gp_tokens collection permissions');
}

export async function down () {
	console.log('There is no down operation for this migration.');
}
