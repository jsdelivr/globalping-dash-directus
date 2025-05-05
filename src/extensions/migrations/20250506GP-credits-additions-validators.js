export async function up (knex) {
	await knex.raw(`
		CREATE TRIGGER trg_check_adopted_probe_insert
		BEFORE INSERT ON gp_credits_additions
		FOR EACH ROW
		BEGIN
			IF (NEW.reason = 'adopted_probe' AND (NEW.adopted_probe IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(NEW.meta, '$.id')) IS NULL))
			OR (NEW.reason = 'adopted_probe' AND NEW.adopted_probe != JSON_UNQUOTE(JSON_EXTRACT(NEW.meta, '$.id'))) THEN
				SIGNAL SQLSTATE '45000'
					SET MESSAGE_TEXT = 'adopted_probe must match meta.id when reason is adopted_probe';
			END IF;
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER trg_check_adopted_probe_update
		BEFORE UPDATE ON gp_credits_additions
		FOR EACH ROW
		BEGIN
			IF (NEW.reason = 'adopted_probe' AND (NEW.adopted_probe IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(NEW.meta, '$.id')) IS NULL))
			OR (NEW.reason = 'adopted_probe' AND NEW.adopted_probe != JSON_UNQUOTE(JSON_EXTRACT(NEW.meta, '$.id'))) THEN
				SIGNAL SQLSTATE '45000'
					SET MESSAGE_TEXT = 'adopted_probe must match meta.id when reason is adopted_probe';
			END IF;
		END;
	`);

	console.log('Triggers for gp_credits_additions created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
