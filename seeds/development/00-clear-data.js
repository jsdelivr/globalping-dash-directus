/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	await knex.transaction(async (trx) => {
		await trx('gp_apps_approvals').delete();
		await trx('gp_apps').delete();
		await trx('gp_tokens').delete();
		await trx('gp_probes').delete();
		await trx('sponsors').delete();
		await trx('gp_credits_additions').delete();
		await trx('gp_credits_deductions').delete();
		await trx('gp_credits').delete();
		await trx('gp_location_overrides').delete();
		await trx('directus_users').whereNot({ first_name: 'Admin', last_name: 'User' }).delete();
	});
};
