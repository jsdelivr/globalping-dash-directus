import _ from 'lodash';

export async function up (knex) {
	const TABLE_NAME = 'gp_probes';
	const probes = await knex(TABLE_NAME).select().whereNotNull('userId');
	const probesWithName = probes.filter(p => p.name);
	const probesWithoutName = probes.filter(p => !p.name);

	const groupedProbes = _.groupBy(probesWithName, p => `${p.userId}_${p.country}_${p.city}`);

	for (const probe of probesWithoutName) {
		const key = `${probe.userId}_${probe.country}_${probe.city}`;
		const otherProbes = groupedProbes[key] || [];
		const name = `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}-${(otherProbes.length + 1).toString().padStart(2, '0')}`;
		await knex(TABLE_NAME).where({ id: probe.id }).update({ name });
		const newKey = `${probe.userId}_${probe.country}_${probe.city}`;

		if (!groupedProbes[newKey]) { groupedProbes[newKey] = []; }

		groupedProbes[newKey].push({ ...probe, name });
	}

	console.log('Default probe names fulfilled');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
