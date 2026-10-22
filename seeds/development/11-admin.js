/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getAdmin = async () => {
		return knex('directus_users').where({ email: 'admin@example.com' }).first();
	};

	let admin = await getAdmin();

	if (!admin) {
		throw new Error('Admin not found');
	}

	await knex('directus_users').where({ id: admin.id }).update({
		token: 'e2e-directus-admin-static-token',
	});
};
