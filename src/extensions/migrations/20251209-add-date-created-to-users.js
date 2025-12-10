const fillUserDateCreated = async (knex) => {
	const usersToUpdate = await knex('directus_users')
		.select('id', 'external_identifier', 'provider')
		.whereNull('date_created');

	for (const user of usersToUpdate) {
		const queries = [];

		queries.push(knex.select('date_created as event_date')
			.from('gp_probes')
			.where('userId', user.id));

		queries.push(knex.select('timestamp as event_date')
			.from('directus_notifications')
			.where('recipient', user.id));

		if (user.provider === 'github' && user.external_identifier) {
			queries.push(knex.select('date_created as event_date')
				.from('gp_credits_additions')
				.where('github_id', user.external_identifier));
		}

		const oldestEvent = await knex
			.union(queries, true)
			.orderBy('event_date', 'asc')
			.first();

		if (oldestEvent?.event_date) {
			await knex('directus_users')
				.where('id', user.id)
				.update({ date_created: oldestEvent.event_date });
		} else {
			await knex('directus_users')
				.where('id', user.id)
				.update({ date_created: knex.fn.now() });
		}
	}
};

export async function up (knex) {
	await fillUserDateCreated(knex);
	console.log('Backfilled missing users\' date_created field.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
