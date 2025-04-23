/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ github_username: 'johndoe' })
			.select('id', 'external_identifier', 'github_username')
			.first();
	};

	let user = await getUser();

	const getProbe = async () => {
		return knex('gp_probes')
			.where({ ip: '2a03:5c00:0:a01::54:cf' })
			.select('id')
			.first();
	};

	const probe = await getProbe();

	await knex('gp_credits_additions').insert([{
		amount: 100000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 50,
		}),
		consumed: 1,
		date_created: '2024-01-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 10000,
		reason: 'recurring_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 5,
		}),
		consumed: 1,
		date_created: '2024-02-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 150,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probe.id,
			name: 'adopted-probe-2',
			ip: '213.136.174.80',
		}),
		consumed: 1,
		date_created: '2024-03-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 150,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probe.id,
			name: 'adopted-probe-2',
			ip: '213.136.174.80',
		}),
		consumed: 1,
		date_created: '2024-03-06 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 150,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probe.id,
			name: 'adopted-probe-2',
			ip: '213.136.174.80',
		}),
		consumed: 1,
		date_created: '2024-03-07 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 150,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probe.id,
			name: 'adopted-probe-2',
			ip: '213.136.174.80',
		}),
		consumed: 1,
		date_created: '2024-03-08 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	}, {
		amount: 20000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 10,
		}),
		consumed: 1,
		date_created: '2024-04-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	},
	{
		amount: 30000,
		reason: 'recurring_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 15,
		}),
		consumed: 1,
		date_created: '2024-05-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
	}]);

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 6000 ]) });

	await knex('gp_credits_deductions').where({ user_id: user.id }).update({ date: '2024-04-01' });

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 5000 ]) });
};
