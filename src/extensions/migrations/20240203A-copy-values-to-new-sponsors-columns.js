export async function up (knex) {
	const oldFormatColumns = await knex.schema.hasColumn('sponsors', 'githubId');

	if (oldFormatColumns) {
		await knex('sponsors').update({
			github_id: knex.ref('githubId'),
			github_login: knex.ref('githubLogin'),
			monthly_amount: knex.ref('monthlyAmount'),
			last_earning_date: knex.ref('lastEarningDate'),
		});
	}

	console.log('Sponsors values copied');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
