export async function up (knex) {
	await knex('gp_probes')
		.whereRaw('name REGEXP ?', [ '(?-i)^probe-[a-z]{2}-[^\\p{Changes_When_Lowercased} \\n]+-[0-9]{2,}\\z' ])
		.update({ name: knex.raw('SUBSTRING(name, 7)') });

	console.log('Default probe name prefixes removed');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
