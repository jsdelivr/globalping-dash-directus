// Freeze the existing redirects: later mappings must not change historical attribution.
const redirects = {
	66716858: '6209808',
	203478287: '163146',
	21207279: '219827779',
	138994461: '90101384',
	133026984: '38296588',
	154700772: '180483416',
	20308900: '1583095',
	138632438: '191276444',
	46052696: '628622',
	36424661: '59905',
	177108879: '209476416',
	352555837: '1834071',
};

// GitHub's complete sponsorship history was checked on 2026-11-06: none of these
// recipients sponsored directly. Leave newer, unaudited additions unchanged.
const lastAuditedAdditionId = 2000207;

export async function up (knex) {
	await knex.transaction(async (trx) => {
		for (const [ source, target ] of Object.entries(redirects)) {
			await trx('gp_credits_additions')
				.where('github_id', target)
				.where('id', '<=', lastAuditedAdditionId)
				.whereNotExists(trx('sponsors').select(trx.raw('1')).whereColumn('sponsors.github_id', 'gp_credits_additions.github_id'))
				.whereIn('reason', [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ])
				.whereRaw(`JSON_VALUE(meta, '$.sponsorGithubId') IS NULL`)
				.whereRaw(`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.manual')), 'false') <> 'true'`)
				.update({ meta: trx.raw(`JSON_SET(COALESCE(meta, JSON_OBJECT()), '$.sponsorGithubId', ?)`, [ source ]) });
		}
	});
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
