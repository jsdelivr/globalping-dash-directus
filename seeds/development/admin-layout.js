/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	const admin = await knex('directus_users')
		.join('directus_roles', 'directus_users.role', 'directus_roles.id')
		.where({ 'directus_roles.name': 'Administrator' })
		.select('directus_users.id')
		.first();

	if (!admin) {
		throw new Error('Not found user with a "Administrator" role. Sign up using github to create one.');
	}

	await Promise.all([
		knex('directus_presets').where({ user: admin.id }).delete(),
	]);

	await knex('directus_presets').insert([{
		user: admin.id,
		collection: 'gp_adopted_probes',
		layout_query: { tabular: { fields: [ 'id', 'userId.first_name', 'ip', 'city', 'country', 'name', 'status', 'onlineTimesToday' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'jsd_purge_tokens',
		layout_query: { tabular: { fields: [ 'id', 'user_created', 'name', 'value', 'expire', 'origins', 'date_last_used' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'gp_tokens',
		layout_query: { tabular: { fields: [ 'id', 'user_created', 'name', 'value', 'expire', 'origins', 'date_last_used' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'gp_credits',
		layout_query: { tabular: { fields: [ 'id', 'user_id.first_name', 'amount' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'gp_credits_additions',
		layout_query: { tabular: { fields: [ 'id', 'github_id', 'amount', 'comment', 'adopted_probe.ip' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'gp_credits_deductions',
		layout_query: { tabular: { fields: [ 'id', 'user_id.first_name', 'amount', 'date' ] } },
		icon: 'bookmark',
	},
	{
		user: admin.id,
		collection: 'sponsors',
		layout_query: { tabular: { fields: [ 'id', 'github_login', 'monthly_amount', 'last_earning_date' ] } },
		icon: 'bookmark',
	}]);
};
