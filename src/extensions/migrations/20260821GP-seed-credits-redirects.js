import crypto from 'node:crypto';

const SOURCE_ID_TO_TARGET_ID = {
	66716858: '6209808',
	203478287: '163146',
	21207279: '219827779',
	138994461: '90101384',
	133026984: '38296588',
	154700772: '180483416',
	20308900: '1583095',
	138632438: '191276444',
};

export async function up (knex) {
	const rows = Object.entries(SOURCE_ID_TO_TARGET_ID).map(([ source, target ]) => ({
		id: crypto.randomUUID(),
		source_github_id: source,
		target_github_id: target,
	}));

	await knex('gp_credits_redirects').insert(rows);

	console.log(`Seeded ${rows.length} credits redirects.`);
}

export async function down (knex) {
	await knex('gp_credits_redirects').whereIn('source_github_id', Object.keys(SOURCE_ID_TO_TARGET_ID)).delete();
}
