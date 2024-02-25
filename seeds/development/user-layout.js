/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	const user = await knex('directus_users')
		.join('directus_roles', 'directus_users.role', 'directus_roles.id')
		.where({ 'directus_roles.name': 'User' })
		.select('directus_users.id')
		.first();

	if (!user) {
		throw new Error('Not found user with a "User" role. Sign up using github to create one.');
	}

	await Promise.all([
		knex('directus_presets').where({ user: user.id }).delete(),
	]);

	await knex('directus_presets').insert([{
		user: user.id,
		collection: 'gp_adopted_probes',
		layout_query: { tabular: { fields: [ 'id', 'userId.first_name', 'ip', 'city', 'country', 'name', 'status' ] } },
		icon: 'bookmark',
	},
	{
		user: user.id,
		collection: 'jsd_purge_tokens',
		layout_query: { tabular: { fields: [ 'id', 'user_created', 'name', 'value', 'expire', 'origins', 'date_last_used' ] } },
		icon: 'bookmark',
	},
	{
		user: user.id,
		collection: 'gp_tokens',
		layout_query: { tabular: { fields: [ 'id', 'user_created', 'name', 'value', 'expire', 'origins', 'date_last_used' ] } },
		icon: 'bookmark',
	},
	{
		user: user.id,
		collection: 'gp_credits',
		layout_query: { tabular: { fields: [ 'amount' ] } },
		icon: 'bookmark',
	},
	{
		user: user.id,
		collection: 'gp_credits_additions',
		layout_query: { tabular: { fields: [ 'amount', 'comment', 'adopted_probe.ip' ] } },
		icon: 'bookmark',
	},
	{
		user: user.id,
		collection: 'gp_credits_deductions',
		layout_query: { tabular: { fields: [ 'amount', 'date' ] } },
		icon: 'bookmark',
	}]);
};
