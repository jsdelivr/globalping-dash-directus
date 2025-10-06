export async function up (knex) {
	await knex.transaction(async (trx) => {
		await trx.raw(`DROP FUNCTION IF EXISTS generate_search_index`);
		await trx.raw(`DROP TRIGGER IF EXISTS gp_probes_searchIndex_before_insert`);
		await trx.raw(`DROP TRIGGER IF EXISTS gp_probes_searchIndex_before_update`);

		await trx.raw(`
			CREATE FUNCTION generate_search_index(
			    userId VARCHAR(255),
				name VARCHAR(255),
				city VARCHAR(255),
				country VARCHAR(255),
				countryName VARCHAR(255),
				state VARCHAR(255),
				stateName VARCHAR(255),
				asn INT,
				network VARCHAR(255),
				continent VARCHAR(255),
				continentName VARCHAR(255),
				region VARCHAR(255),
				tags LONGTEXT,
				systemTags LONGTEXT,
				ip VARCHAR(255),
				altIps LONGTEXT
			) RETURNS TEXT
			DETERMINISTIC
			BEGIN
				DECLARE tagsText TEXT;
				DECLARE systemTagsText TEXT;
				DECLARE githubUsername TEXT;
				DECLARE altIpsText TEXT;

				SELECT GROUP_CONCAT(CONCAT('u-', t.prefix, ':', t.value) SEPARATOR '\n')
				INTO tagsText
				FROM JSON_TABLE(
					tags,
					'$[*]' COLUMNS (
					prefix VARCHAR(255) PATH '$.prefix',
					value  VARCHAR(255) PATH '$.value'
					)
				) AS t;

				SELECT GROUP_CONCAT(st.value SEPARATOR '\n')
				INTO systemTagsText
				FROM JSON_TABLE(
					systemTags,
					'$[*]' COLUMNS (
					value VARCHAR(255) PATH '$'
					)
				) AS st;

				IF userId IS NOT NULL THEN
					SELECT CONCAT('u-', github_username)
					INTO githubUsername
					FROM directus_users
					WHERE id = userId
					LIMIT 1;
				END IF;

				SELECT GROUP_CONCAT(a.value SEPARATOR '\n')
				INTO altIpsText
				FROM JSON_TABLE(
					altIps,
					'$[*]' COLUMNS (
						value VARCHAR(255) PATH '$'
					)
				) AS a;

				RETURN LOWER(CONCAT_WS('\n',
					name,
					city,
					country,
					countryName,
					state,
					stateName,
					asn,
					network,
					continent,
					continentName,
					region,
					tagsText,
					systemTagsText,
					githubUsername,
					ip,
					altIpsText
				));
			END;
		`);

		await trx.raw(`
			CREATE TRIGGER gp_probes_searchIndex_before_insert
			BEFORE INSERT ON gp_probes
			FOR EACH ROW
			BEGIN
				SET NEW.searchIndex = generate_search_index(
					NEW.userId,
					NEW.name,
					NEW.city,
					NEW.country,
					NEW.countryName,
					NEW.state,
					NEW.stateName,
					NEW.asn,
					NEW.network,
					NEW.continent,
					NEW.continentName,
					NEW.region,
					NEW.tags,
					NEW.systemTags,
					NEW.ip,
					NEW.altIps
				);
			END;
		`);

		await trx.raw(`
			CREATE TRIGGER gp_probes_searchIndex_before_update
			BEFORE UPDATE ON gp_probes
			FOR EACH ROW
			BEGIN
				SET NEW.searchIndex = generate_search_index(
					NEW.userId,
					NEW.name,
					NEW.city,
					NEW.country,
					NEW.countryName,
					NEW.state,
					NEW.stateName,
					NEW.asn,
					NEW.network,
					NEW.continent,
					NEW.continentName,
					NEW.region,
					NEW.tags,
					NEW.systemTags,
					NEW.ip,
					NEW.altIps
				);
			END;
		`);

		await trx.raw(`
			UPDATE gp_probes
			SET searchIndex = generate_search_index(
				userId, name, city, country, countryName, state, stateName, asn, network, continent, continentName, region, tags, systemTags, ip, altIps
			)
		`);
	});

	console.log('Triggers for searchIndex column of gp_probes updated');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
