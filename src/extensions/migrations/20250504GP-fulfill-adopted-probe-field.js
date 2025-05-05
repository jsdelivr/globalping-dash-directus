import Bluebird from 'bluebird';

export async function up (knex) {
	const TABLE_NAME = 'gp_credits_additions';
	const additions = await knex(TABLE_NAME).select('*').where({ reason: 'adopted_probe' });

	await Bluebird.map(additions, async (addition) => {
		const meta = JSON.parse(addition.meta || '{}');

		if (meta.id) {
			await knex(TABLE_NAME)
				.where('id', addition.id)
				.update({
					adopted_probe: meta.id,
				});
		}
	}, { concurrency: 16 });

	console.log('Successfully updated gp_credits_additions with adopted_probe values.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
