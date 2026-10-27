const SPONSORSHIP_REASONS = [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ];

export async function up (knex) {
	const redirects = await knex('gp_credits_redirects').select('source_github_id', 'target_github_id');
	const targets = redirects.map(redirect => redirect.target_github_id);

	const redirected = await Promise.all(redirects.map(redirect => knex('gp_credits_additions')
		.where({ github_id: redirect.target_github_id })
		.whereIn('reason', SPONSORSHIP_REASONS)
		.update({ meta: knex.raw('JSON_SET(meta, \'$.sponsorGithubId\', ?)', [ redirect.source_github_id ]) })));

	const own = await knex('gp_credits_additions')
		.whereIn('reason', SPONSORSHIP_REASONS)
		.whereNotIn('github_id', targets)
		.update({ meta: knex.raw('JSON_SET(meta, \'$.sponsorGithubId\', github_id)') });

	console.log(`Stamped sponsorGithubId on ${own + redirected.reduce((sum, count) => sum + count, 0)} credits additions.`);
}

export async function down (knex) {
	await knex('gp_credits_additions')
		.whereIn('reason', SPONSORSHIP_REASONS)
		.update({ meta: knex.raw('JSON_REMOVE(meta, \'$.sponsorGithubId\')') });
}
