/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ github_username: 'christopherturk' })
			.select('id', 'external_identifier', 'github_username')
			.first();
	};

	let user = await getUser();

	if (!user) {
		const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();

		await knex('directus_users').insert([{
			id: 'd966da64-3efe-4657-a04d-405259953a81',
			first_name: 'Christopher',
			last_name: 'Turk',
			email: 'newuser@example.com',
			password: '$argon2id$v=19$m=65536,t=3,p=4$FWk5PI2rZQmqDPrAp/3qtg$FqioDybXPiDTUCPkNOgPa6OQJRxE/VfUiFH2q0sXHf8', // password: newuser
			role: userRole.id,
			provider: 'default',
			external_identifier: '1234567892',
			email_notifications: 0,
			github_organizations: JSON.stringify([]),
			github_username: 'christopherturk',
			user_type: 'member',
			token: 'dgx4jbUG7q7FmJF4zGFHtPyov2h3vIoB',
			adoption_token: 'y5blwmhcwlxlc4asuagxp2lv3vuqeve7',
			default_prefix: 'christopherturk',
		}]);

		console.log('Mock new user created. email: newuser@example.com password: newuser');

		user = await getUser();
	}
};
