export async function up (knex) {
	const TABLE_NAME = 'gp_probes';
	const probesWithCustomLocation = await knex(TABLE_NAME).select().where({ isCustomCity: true });

	const updatedProbes = await Promise.all(probesWithCustomLocation.map(async (probe) => {
		return {
			...probe,
			customLocation: JSON.stringify({
				country: probe.countryOfCustomCity,
				city: probe.city,
				latitude: probe.latitude,
				longitude: probe.longitude,
				state: probe.state,
			}),
			allowedCountries: JSON.stringify([ probe.countryOfCustomCity ]),
		};
	}));

	for (const user of updatedProbes) {
		await knex(TABLE_NAME).where({ id: user.id }).update({
			customLocation: user.customLocation,
			allowedCountries: user.allowedCountries,

		});
	}

	console.log('Added custom location object to every custom location probe.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}

// To remove: countryOfCustomCity, isCustomCity
