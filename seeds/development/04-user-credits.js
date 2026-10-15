import relativeDayUtc from 'relative-day-utc';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ github_username: 'john' })
			.select('id', 'external_identifier', 'github_username')
			.first();
	};

	let user = await getUser();
	const admin = await knex('directus_users').where({ email: 'admin@example.com' }).select('id').first();

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

	// Manual additions created through the Sponsors administration page.
	await knex('gp_credits_additions').insert([{
		amount: 75_000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 35,
			manual: true,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-5),
		github_id: user.external_identifier,
		user_updated: admin.id,
	}, {
		amount: 15_000,
		reason: 'other',
		meta: JSON.stringify({
			comment: 'Customer support adjustment.',
			manual: true,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-10),
		github_id: user.external_identifier,
		user_updated: admin.id,
	}, ...Array.from({ length: 9 }, (_, index) => ({
		amount: 20_000 + index * 1_000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 10 + index,
			manual: true,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-20 - index),
		github_id: `900000000${index + 1}`,
		user_updated: admin.id,
	})) ]);

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

	// Sponsor admin examples: tier change, former recurring, and one-time only.
	await knex('gp_credits_additions').insert([{
		amount: 20000,
		reason: 'tier_changed',
		meta: JSON.stringify({
			amountInDollars: 10,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-15),
		github_id: user.external_identifier,
		user_updated: null,
	}, {
		amount: 40000,
		reason: 'recurring_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 20,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-30),
		github_id: '1234567892',
		user_updated: null,
	}, {
		amount: 50000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 25,
		}),
		consumed: 1,
		date_created: relativeDayUtc(-45),
		github_id: '9876543210',
		user_updated: null,
	}]);

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
