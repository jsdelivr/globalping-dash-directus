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

	if (!user) {
		const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();

		await knex('directus_users').insert([{
			id: 'b2193f5b-4a8b-4513-8e5a-1559478bebde',
			first_name: 'John',
			last_name: 'Doe',
			email: 'user@example.com',
			password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
			role: userRole.id,
			provider: 'default',
			external_identifier: '1234567890',
			email_notifications: 0,
			github_organizations: JSON.stringify([ 'MaxCDN', 'appfleetcloud', 'jsdelivr', 'nice-registry', 'polyfills' ]),
			github_username: 'johndoe',
			user_type: 'sponsor',
			token: 'ZUGcg_zQgPPuxmE9SWnR0eDyp-qszMP7',
			adoption_token: 'HwuHxzK9ewaFjhWcFR0m3zPTuqyITyql',
			default_prefix: 'johndoe',
			public_probes: true,
		}]);

		console.log('Mock power user created. email: user@example.com password: user');

		user = await getUser();
	}

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
		github_id: '6192491999',
		github_login: 'MartinKolarikU1',
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 100,
	}]);
};
