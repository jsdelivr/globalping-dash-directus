export async function up (knex) {
	await knex.transaction(async (trx) => {
		await trx.raw(`
			CREATE OR REPLACE FUNCTION generate_search_index(
				accountId VARCHAR(255),
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
				DECLARE ownerName TEXT;
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

				IF accountId IS NOT NULL THEN
					SELECT CONCAT('u-', COALESCE(o.name, u.github_username))
					INTO ownerName
					FROM gp_accounts a
					LEFT JOIN directus_users u ON a.user = u.id
					LEFT JOIN gp_orgs o ON a.org = o.id
					WHERE a.id = accountId
					LIMIT 1;
				END IF;

				SELECT GROUP_CONCAT(a.value SEPARATOR '\n' LIMIT 32)
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
					CONCAT('AS', asn),
					network,
					continent,
					continentName,
					region,
					tagsText,
					systemTagsText,
					ownerName,
					ip,
					altIpsText
				));
			END;
		`);

		for (const event of [ 'insert', 'update' ]) {
			await trx.raw(`DROP TRIGGER IF EXISTS gp_probes_searchIndex_before_${event};`);

			// The owner is resolved here rather than taken from NEW.account_id alone: gp_probes_fulfill_account fills that column in
			// its own trigger, and triggers on the same event run in creation order, which no migration should have to depend on.
			await trx.raw(`
				CREATE TRIGGER gp_probes_searchIndex_before_${event}
				BEFORE ${event.toUpperCase()} ON gp_probes
				FOR EACH ROW
				BEGIN
					SET NEW.searchIndex = generate_search_index(
						COALESCE(NEW.account_id, (SELECT id FROM gp_accounts WHERE user = NEW.userId LIMIT 1)),
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
		}

		await trx.raw(`
			UPDATE gp_probes
			SET searchIndex = generate_search_index(
				account_id, name, city, country, countryName, state, stateName, asn, network, continent, continentName, region, tags, systemTags, ip, altIps
			)
		`);
	});

	console.log('searchIndex now resolves the owner name from account_id');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
