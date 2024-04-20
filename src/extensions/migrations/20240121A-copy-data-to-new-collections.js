export async function up (knex) {
	const tokensTableExists = await knex.schema.hasTable('tokens');
	const probesTableExists = await knex.schema.hasTable('adopted_probes');
	const usersTableExists = await knex.schema.hasTable('directus_users');

	await knex.transaction(async (trx) => {
		if (!tokensTableExists || !probesTableExists || !usersTableExists) {
			console.log('Old collections do not exist, migration of data is not required.');
		} else {
			await trx.raw(`INSERT INTO jsd_purge_tokens (
				date_created,
				date_updated,
				expire,
				id,
				name,
				origins,
				user_created,
				user_updated,
				value
			) SELECT date_created, date_updated, expire, id, name, origins, user_created, user_updated, value FROM tokens`);

			await trx.raw(`INSERT INTO gp_adopted_probes (
				asn,
				country,
				city,
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
				version
			) SELECT asn, country, city, countryOfCustomCity, date_created, date_updated, id, ip, isCustomCity, lastSyncDate, latitude, longitude, name, network, onlineTimesToday, state, status, tags, userId, uuid, version FROM adopted_probes`);

			await trx.raw(`INSERT INTO gp_credits (
				comment,
				credits,
				date_created,
				date_updated,
				githubId,
				id,
				user_updated
			) SELECT comment, credits, date_created, date_updated, githubId, id, user_updated FROM credits`);
		}

		await trx('directus_permissions').where('collection', 'tokens').update({
			collection: 'jsd_purge_tokens',
		});

		await trx('directus_permissions').where('collection', 'adopted_probes').update({
			collection: 'gp_adopted_probes',
		});

		await trx('directus_permissions').where('collection', 'credits').update({
			collection: 'gp_credits',
		});
	});

	console.log('Completed migration to new collections');
}

export async function down () {
	console.log('There is no down operation for this migration.');
}
