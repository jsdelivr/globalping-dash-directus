import relativeDayUtc from 'relative-day-utc';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ github_username: 'john-doe' })
			.select('id', 'external_identifier', 'github_username')
			.first();
	};

	let user = await getUser();

	// One time sponsorship credits
	await knex('gp_credits_additions').insert([{
		amount: 100000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 50,
		}),
		consumed: 1,
		date_created: relativeDayUtc(0),
		github_id: user.external_identifier,
	}, {
		amount: 20000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 10,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-60),
		github_id: user.external_identifier,
		user_updated: null,
	}, {
		amount: 30000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 15,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-120),
		github_id: user.external_identifier,
		user_updated: null,
	}, {
		amount: 40000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 20,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-180),
		github_id: user.external_identifier,
		user_updated: null,
	}, {
		amount: 50000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 25,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-240),
		github_id: user.external_identifier,
		user_updated: null,
	}]);

	// Recurring sponsorship credits
	await knex('gp_credits_additions').insert([
		...Array.from(Array(24).keys()).map(i => ({
			amount: 10000,
			reason: 'recurring_sponsorship',
			meta: JSON.stringify({
				amountInDollars: 5,
			}),
			consumed: 1,
			date_created: relativeDayUtc(-i * 30),
			github_id: user.external_identifier,
			user_updated: null,
		})),
	]);

	const getProbe1 = async () => {
		return knex('gp_probes')
			.where({ ip: '213.136.174.80' })
			.select('id')
			.first();
	};

	const getProbe2 = async () => {
		return knex('gp_probes')
			.where({ ip: '131.255.7.26' })
			.select('id')
			.first();
	};

	const probe1 = await getProbe1();
	const probe2 = await getProbe2();

	// Adopted probe credits
	await knex('gp_credits_additions').insert([
		...Array.from(Array(205).keys()).map(i => ({
			amount: 150,
			reason: 'adopted_probe',
			meta: JSON.stringify({
				id: probe1.id,
				name: null,
				ip: '213.136.174.80',
			}),
			consumed: 1,
			date_created: relativeDayUtc(-i),
			github_id: user.external_identifier,
			user_updated: null,
			adopted_probe: probe1.id,
		})),
		...Array.from(Array(50).keys()).map(i => ({
			amount: 150,
			reason: 'adopted_probe',
			meta: JSON.stringify({
				id: probe2.id,
				name: 'Buenos Aires Probe 123',
				ip: '131.255.7.26',
			}),
			consumed: 1,
			date_created: relativeDayUtc(-i),
			github_id: user.external_identifier,
			user_updated: null,
			adopted_probe: probe2.id,
		})),
	]);

	for (const i of Array.from(Array(50).keys())) {
		await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 7000 ]) });
		await knex('gp_credits_deductions').where({ user_id: user.id }).orderBy('date', 'desc').limit(1).update({ date: relativeDayUtc((i + 1) * -3) });
	}

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 7000 ]) });
};
