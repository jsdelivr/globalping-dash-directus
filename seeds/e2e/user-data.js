export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ email: 'e2e@example.com' })
			.select('directus_users.id', 'directus_users.external_identifier', 'directus_users.github_username')
			.first();
	};

	let user = await getUser();

	if (!user) {
		const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();

		await knex('directus_users').insert([{
			id: '940d4737-394d-428f-b9d5-d98bf1f2a066',
			first_name: 'John',
			last_name: 'Doe',
			email: 'e2e@example.com',
			password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
			role: userRole.id,
			provider: 'default',
			external_identifier: '1111111',
			email_notifications: 1,
			github_organizations: JSON.stringify([ 'Scrubs' ]),
			github_username: 'johndoe',
			user_type: 'member',
		}]);

		console.log('Mock user created. email: e2e@example.com password: user');

		user = await getUser();
	}

	await Promise.all([
		knex('gp_apps').delete(),
		knex('gp_tokens').delete(),
		knex('gp_adopted_probes').delete(),
		knex('sponsors').delete(),
		knex('gp_credits_additions').delete(),
		knex('gp_credits_deductions').delete(),
		knex('gp_credits').delete(),
	]);
};
