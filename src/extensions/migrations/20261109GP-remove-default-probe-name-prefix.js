export async function up (knex) {
	// The root location fields already include user overrides.
	await knex('gp_probes')
		.whereRaw('name REGEXP ?', [ '(?-i)^probe-[a-z]{2}-.+-[0-9]{2,}\\z' ])
		.whereRaw(`BINARY name = BINARY CONCAT(
			'probe-', LOWER(REPLACE(country, ' ', '-')), '-',
			LOWER(REPLACE(city, ' ', '-')), '-', SUBSTRING_INDEX(name, '-', -1)
		)`)
		.update({ name: knex.raw('SUBSTRING(name, 7)') });

	console.log('Default probe name prefixes removed');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
