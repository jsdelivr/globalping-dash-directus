/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	const user = await knex('directus_users')
		.join('directus_roles', 'directus_users.role', 'directus_roles.id')
		.where({ 'directus_roles.name': 'User' })
		.select('directus_users.id', 'directus_users.external_identifier', 'directus_users.github_username')
		.first();

	if (!user) {
		throw new Error('Not found user with a "User" role. Sign up using github to create one.');
	}

	await Promise.all([
		knex('jsd_purge_tokens').delete(),
		knex('gp_tokens').delete(),
		knex('gp_adopted_probes').delete(),
		knex('sponsors').delete(),
		knex('gp_credits_additions').delete(),
		knex('gp_credits_deductions').delete(),
		knex('gp_credits').delete(),
	]);

	await knex('jsd_purge_tokens').insert([{
		name: 'jsd-token-1',
		value: 'W4jbiJLf7Lq96/Y8BDFa+rR1BLg+40OzRSEW861mzrk=', // token: 46YlMw6l2o0RvWmhuQECmbSps6Zi4kpz
		user_created: user.id,
		date_created: '2024-02-22 10:46:15',
	}, {
		name: 'jsd-token-2',
		value: 'bnIf3K5QY1nNVhEXPlZci8cc8d3fXA8V6tAa2NdoVCA=', // token: 8yMyVzixoKKw3uMu19cNdZRgxT9qojhK
		user_created: user.id,
		user_updated: user.id,
		date_created: '2024-02-22 10:49:06',
		date_last_used: '2024-02-21',
		date_updated: '2024-02-22 10:49:45',
		expire: '2027-02-01',
		origins: JSON.stringify([ 'https://www.jsdelivr.com', 'https://www.jsdelivr.com:10000' ]),
	}]);

	await knex('gp_tokens').insert([{
		name: 'gp-token-1',
		value: '0gW0wltTSo1g0WOVYxBrxGZM0ifmRH9TFiIG9GWOo8s=', // token: YmCn0sLiTmdjPmR/KQjyl9tdlpirtQKB
		date_created: '2024-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: null,
		user_created: user.id,
		user_updated: null,
	}, {
		name: 'gp-token-2',
		value: 'YjVt9t1OiYEa7rHFzAvxH0bLZtd5fYtdzBSvQSyeSiY=', // token: QVJFyYWiEDKx6nGIqo7iMd47mx3yYBEX
		date_created: '2024-02-22 10:57:21',
		date_last_used: '2024-02-21',
		date_updated: '2024-02-22 10:49:45',
		expire: '2027-02-01',
		origins: JSON.stringify([ 'https://www.jsdelivr.com', 'https://www.jsdelivr.com:10000' ]),
		user_created: user.id,
		user_updated: user.id,
	}]);

	const adoptedProbesIds = await knex('gp_adopted_probes').insert([{
		asn: 3302,
		city: 'Naples',
		country: 'IT',
		countryOfCustomCity: 'IT',
		date_created: '2024-02-22 11:04:30',
		date_updated: '2024-02-22 11:05:48',
		ip: '213.136.174.80',
		isCustomCity: 1,
		lastSyncDate: new Date(),
		latitude: 40.85216,
		longitude: 14.26811,
		name: 'adopted-probe-2',
		network: 'IRIDEOS S.P.A.',
		onlineTimesToday: 120,
		state: null,
		status: 'ready',
		tags: JSON.stringify([{ value: 'tag-1', prefix: 'test-user-bdf-2' }]),
		userId: user.id,
		uuid: '681023cb-6aec-45a1-adde-e705c4043549',
		version: '0.28.0',
		hardwareDevice: null,
	},
	{
		asn: 61493,
		city: 'Buenos Aires',
		country: 'AR',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: '131.255.7.26',
		isCustomCity: 0,
		lastSyncDate: new Date(),
		latitude: -34.6131,
		longitude: -58.3772,
		name: null,
		network: 'InterBS S.R.L. (BAEHOST)',
		onlineTimesToday: 0,
		state: null,
		status: 'ready',
		tags: null,
		userId: user.id,
		uuid: 'b42c4319-6be3-46d4-8a01-d4558f0c070c',
		version: '0.28.0',
		hardwareDevice: null,
	}]);

	await knex('sponsors').insert([{
		date_created: '2024-02-22 11:48:00',
		date_updated: null,
		user_created: null,
		user_updated: null,
		github_id: user.external_identifier,
		github_login: user.github_username,
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 5,
	},
	{
		date_created: '2024-02-22 11:48:00',
		date_updated: null,
		user_created: null,
		user_updated: null,
		github_id: '1834071',
		github_login: 'jimaek',
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 100,
	}]);

	await knex('gp_credits_additions').insert([{
		amount: 100000,
		comment: 'For 50$ sponsorship',
		consumed: 1,
		date_created: '2024-02-22 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 10000,
		comment: 'For $5 recurring sponsorship',
		consumed: 1,
		date_created: '2024-02-22 11:51:00',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 150,
		comment: 'For the adopted probe adopted-probe-2 (213.136.174.80)',
		consumed: 1,
		date_created: '2024-02-22 11:53:00',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: adoptedProbesIds[0],
	}]);

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 110000 ]) });
};
