/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.join('directus_roles', 'directus_users.role', 'directus_roles.id')
			.where({ 'directus_roles.name': 'User' })
			.select('directus_users.id', 'directus_users.external_identifier', 'directus_users.github_username')
			.first();
	};

	let user = await getUser();

	if (!user) {
		const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();

		await knex('directus_users').insert([{
			id: 'b2193f5b-4a8b-4513-8e5a-1559478bebde',
			first_name: 'Dmitriy',
			last_name: 'Akulov',
			email: 'user@example.com',
			password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
			role: userRole.id,
			provider: 'default',
			external_identifier: '1834071',
			email_notifications: 1,
			github_organizations: JSON.stringify([ 'MaxCDN', 'appfleetcloud', 'jsdelivr', 'nice-registry', 'polyfills' ]),
			github_username: 'jimaek',
			user_type: 'member',
		}]);

		console.log('Mock user created. email: user@example.com password: user');

		user = await getUser();
	}

	await Promise.all([
		knex('gp_tokens').delete(),
		knex('gp_adopted_probes').delete(),
		knex('sponsors').delete(),
		knex('gp_credits_additions').delete(),
		knex('gp_credits_deductions').delete(),
		knex('gp_credits').delete(),
	]);

	await knex('gp_tokens').insert([{
		name: 'gp-token-1',
		value: '/bSluuDrAPX9zIiZZ/hxEKARwOg+e//EdJgCFpmApbg=', // token: hf2fnprguymlgliirdk7qv23664c2xcr
		date_created: '2024-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: JSON.stringify([]),
		user_created: user.id,
		user_updated: null,
	}, {
		name: 'gp-token-2',
		value: '8YZ2pZoGQxfOeEGvUUkagX1yizZckq3weL+IN0chvU0=', // token: vumzijbzihrskmc2hj34yw22batpibmt
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
		tags: '[]',
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
		github_id: '6192491',
		github_login: 'MartinKolarik',
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 100,
	}]);

	await knex('gp_credits_additions').insert([{
		amount: 10000,
		comment: 'For 50$ sponsorship',
		consumed: 1,
		date_created: '2024-01-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 1000,
		comment: 'For $5 recurring sponsorship',
		consumed: 1,
		date_created: '2024-02-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 150,
		comment: 'For the adopted probe "adopted-probe-2" (213.136.174.80)',
		consumed: 1,
		date_created: '2024-03-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: adoptedProbesIds[0],
	},
	{
		amount: 150,
		comment: 'For the adopted probe "adopted-probe-2" (213.136.174.80)',
		consumed: 1,
		date_created: '2024-03-06 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: adoptedProbesIds[0],
	},
	{
		amount: 150,
		comment: 'For the adopted probe "adopted-probe-2" (213.136.174.80)',
		consumed: 1,
		date_created: '2024-03-07 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: adoptedProbesIds[0],
	},
	{
		amount: 150,
		comment: 'For the adopted probe "adopted-probe-2" (213.136.174.80)',
		consumed: 1,
		date_created: '2024-03-08 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: adoptedProbesIds[0],
	}, {
		amount: 2000,
		comment: 'For 10$ sponsorship',
		consumed: 1,
		date_created: '2024-04-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 3000,
		comment: 'For $15 recurring sponsorship',
		consumed: 1,
		date_created: '2024-05-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	}]);

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 6000 ]) });

	await knex('gp_credits_deductions').where({ user_id: user.id }).update({ date: '2024-04-01' });

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 5000 ]) });
};
