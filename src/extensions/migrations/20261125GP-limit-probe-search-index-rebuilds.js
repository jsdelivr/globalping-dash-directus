// Keep the guard and function call based on the same list of searchable inputs.
const fields = [ 'account_id', 'name', 'city', 'country', 'countryName', 'state', 'stateName', 'asn', 'network', 'continent', 'continentName', 'region', 'tags', 'systemTags', 'ip', 'altIps' ];
const searchIndex = account => `generate_search_index(${[ account, ...fields.slice(1).map(field => `NEW.${field}`) ].join(', ')})`;

export async function up (knex) {
	for (const event of [ 'insert', 'update' ]) {
		await knex.raw(`
			CREATE OR REPLACE TRIGGER gp_probes_searchIndex_before_${event}
			BEFORE ${event.toUpperCase()} ON gp_probes
			FOR EACH ROW
			BEGIN
				DECLARE ownerName TEXT;
				SELECT LOWER(CONCAT('u-', COALESCE(o.name, u.github_username))) INTO ownerName
				FROM gp_accounts a
				LEFT JOIN directus_users u ON a.user = u.id
				LEFT JOIN gp_orgs o ON a.org = o.id
				WHERE a.id = NEW.account_id LIMIT 1;
				${event === 'update' ? `IF NOT (
					${fields.map(field => field === 'asn' ? `NEW.${field} <=> OLD.${field}` : `BINARY NEW.${field} <=> BINARY OLD.${field}`).join(' AND ')}
					AND BINARY NEW.searchIndex <=> BINARY OLD.searchIndex
				) OR (ownerName IS NOT NULL AND NOT (BINARY ownerName <=> BINARY SUBSTRING_INDEX(OLD.searchIndex, '\\n', 1)))
				OR (ownerName IS NULL AND LEFT(OLD.searchIndex, 2) = 'u-')
				OR NEW.searchIndex IS NULL THEN` : ''}
					SET NEW.searchIndex = CONCAT_WS('\\n', ownerName, ${searchIndex('NULL')});
				${event === 'update' ? 'END IF;' : ''}
			END;
		`);
	}

	// Cache the owner as the first line, reusing the existing generator for all other terms.
	// Plain owner reads retain baseline freshness: an older snapshot heals on the next probe update.
	// Without an owner, a name starting "u-" can cause an extra rebuild; the search text stays correct.
	await knex('gp_probes').update({ searchIndex: null });
}

export async function down (knex) {
	for (const event of [ 'insert', 'update' ]) {
		await knex.raw(`
			CREATE OR REPLACE TRIGGER gp_probes_searchIndex_before_${event}
			BEFORE ${event.toUpperCase()} ON gp_probes
			FOR EACH ROW
			SET NEW.searchIndex = ${searchIndex('NEW.account_id')};
		`);
	}

	await knex('gp_probes').update({ searchIndex: null });
}
