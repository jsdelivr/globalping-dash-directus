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
		token: 'VvLt_t0g5Wg_WYpxjRneWWwqh1Wlqhp6',
	});
};
