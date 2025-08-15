export async function up (knex) {
	const TABLE_NAME = 'gp_probes';
	const probes = await knex(TABLE_NAME).select().whereNotNull('customLocation');

	for (const probe of probes) {
		const customLocation = JSON.parse(probe.customLocation);

		const lat = customLocation.latitude;
		const long = customLocation.longitude;

		if (
			(lat % 1 !== 0 && lat.toString().split('.')[1]?.length > 2)
			|| (long % 1 !== 0 && long.toString().split('.')[1]?.length > 2)
		) {
			await knex(TABLE_NAME).where({ id: probe.id }).update({
				customLocation: JSON.stringify({
					...customLocation,
					latitude: Math.round(Number(lat) * 100) / 100,
					longitude: Math.round(Number(long) * 100) / 100,
				}),
			});
		}
	}

	console.log('Latitude and longitude for custom location normalized');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
