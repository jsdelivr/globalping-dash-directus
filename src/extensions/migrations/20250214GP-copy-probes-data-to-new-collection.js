export async function up (knex) {
	const probesTableExists = await knex.schema.hasTable('gp_adopted_probes');

	await knex.transaction(async (trx) => {
		if (!probesTableExists) {
			console.log('Old collection do not exist, migration of data is not required.');
			return;
		}

		await trx.raw(`INSERT INTO gp_probes (
			asn,
			city,
			country,
			countryOfCustomCity,
			date_created,
			date_updated,
			id,
			ip,
			isCustomCity,
			lastSyncDate,
			latitude,
			longitude,
			name,
			network,
			onlineTimesToday,
			state,
			status,
			tags,
			userId,
			uuid,
			version,
			hardwareDevice,
			nodeVersion,
			isIPv4Supported,
			isIPv6Supported,
			altIps,
			systemTags,
			hardwareDeviceFirmware
		) SELECT asn, city, country, countryOfCustomCity, date_created, date_updated, id, ip, isCustomCity, lastSyncDate, latitude, longitude, name, network, onlineTimesToday, state, status, tags, userId, uuid, version, hardwareDevice, nodeVersion, isIPv4Supported, isIPv6Supported, altIps, systemTags, hardwareDeviceFirmware FROM gp_adopted_probes`);

		await trx.raw(`ALTER TABLE gp_probes ADD INDEX gp_probes_ip_index (ip);`);

		const permissions = await trx('directus_permissions').where({ collection: 'gp_adopted_probes' });
		const clonedPermissions = permissions.map(({ id, ...row }) => ({ ...row, collection: 'gp_probes' }));
		clonedPermissions.length && await trx('directus_permissions').insert(clonedPermissions);

		const presets = await trx('directus_presets').where({ collection: 'gp_adopted_probes' });
		const clonedPresets = presets.map(({ id, ...row }) => ({ ...row, collection: 'gp_probes' }));
		clonedPresets.length && await trx('directus_presets').insert(clonedPresets);

		await trx('directus_notifications')
			.where({ collection: 'gp_adopted_probes' })
			.update({ collection: 'gp_probes' });
	});

	console.log('Completed migration from gp_adopted_probes to gp_probes');
}

export async function down () {
	console.log('There is no down operation for this migration.');
}
