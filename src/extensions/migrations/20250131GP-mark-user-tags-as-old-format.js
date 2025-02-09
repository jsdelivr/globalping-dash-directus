export async function up (knex) {
	const probesWithTags = await knex('gp_adopted_probes').select().whereNot({ tags: '[]' });

	probesWithTags.forEach((probe) => {
		probe.tags = JSON.stringify(JSON.parse(probe.tags).map(tag => ({ ...tag, format: 'v1' })));
	});

	for (const probe of probesWithTags) {
		await knex('gp_adopted_probes').where({ id: probe.id }).update({ tags: probe.tags });
	}

	console.log('Marked user tags as old format');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
