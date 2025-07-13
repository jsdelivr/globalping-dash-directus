export async function up (knex) {
	await knex.transaction(async (trx) => {
		await trx.raw(`
			CREATE FUNCTION generate_search_index(
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
				systemTags LONGTEXT
			) RETURNS TEXT
			DETERMINISTIC
			BEGIN
				DECLARE tagsText TEXT;
				DECLARE systemTagsText TEXT;

				SELECT GROUP_CONCAT(CONCAT('u-', t.prefix, ':', t.value) SEPARATOR ' ')
				INTO tagsText
				FROM JSON_TABLE(
					tags,
					'$[*]' COLUMNS (
					prefix VARCHAR(255) PATH '$.prefix',
					value  VARCHAR(255) PATH '$.value'
					)
				) AS t;

				SELECT GROUP_CONCAT(st.value SEPARATOR ' ')
				INTO systemTagsText
				FROM JSON_TABLE(
					systemTags,
					'$[*]' COLUMNS (
					value VARCHAR(255) PATH '$'
					)
				) AS st;

				RETURN LOWER(CONCAT_WS(' ',
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
					systemTagsText
				));
			END;
		`);

		await trx.raw(`
			CREATE TRIGGER gp_probes_searchIndex_before_insert
			BEFORE INSERT ON gp_probes
			FOR EACH ROW
			BEGIN
				SET NEW.searchIndex = generate_search_index(
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
					NEW.systemTags
				);
			END;
		`);

		await trx.raw(`
			CREATE TRIGGER gp_probes_searchIndex_before_update
			BEFORE UPDATE ON gp_probes
			FOR EACH ROW
			BEGIN
				SET NEW.searchIndex = generate_search_index(
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
					NEW.systemTags
				);
			END;
		`);

		await trx.raw(`
			UPDATE gp_probes
			SET searchIndex = generate_search_index(
				name, city, country, countryName, state, stateName, asn, network, continent, continentName, region, tags, systemTags
			)
		`);
	});

	console.log('Triggers for searchIndex column of gp_probes created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
