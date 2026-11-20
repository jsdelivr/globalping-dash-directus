// Runs on its own, before the snapshot drops the legacy owner columns: a trigger that reads a dropped column breaks every write
// to its table.
export async function up (knex) {
	// The columns go NOT NULL first: an ALTER that fails here leaves the fulfill triggers below in place to keep filling them.
	// Not through the snapshot: Directus rewrites a char column as varchar when it alters one, which a foreign key rejects.
	await knex.raw(`ALTER TABLE gp_apps_approvals MODIFY account_id CHAR(36) NOT NULL;`);
	await knex.raw(`ALTER TABLE gp_apps_approvals MODIFY user_created CHAR(36) NOT NULL;`);
	await knex.raw(`ALTER TABLE gp_credits MODIFY account_id CHAR(36) NOT NULL;`);
	await knex.raw(`ALTER TABLE gp_credits_deductions MODIFY account_id CHAR(36) NOT NULL;`);

	console.log('account_id and user_created made NOT NULL');

	await knex.raw(`DROP TRIGGER IF EXISTS gp_tokens_fulfill_account;`);
	await knex.raw(`DROP TRIGGER IF EXISTS gp_apps_approvals_fulfill_account;`);
	await knex.raw(`DROP TRIGGER IF EXISTS gp_probes_fulfill_account;`);
	await knex.raw(`DROP TRIGGER IF EXISTS gp_probes_fulfill_account_on_update;`);

	console.log('account_id fulfill triggers dropped');

	await knex.raw(`
		CREATE OR REPLACE TRIGGER after_gp_credits_additions_insert
		BEFORE INSERT ON gp_credits_additions
		FOR EACH ROW
		BEGIN
			DECLARE found_user_id CHAR(36);
			DECLARE found_account_id CHAR(36);
			SELECT id INTO found_user_id FROM directus_users WHERE external_identifier = NEW.github_id LIMIT 1;

			IF found_user_id IS NOT NULL THEN
				SELECT id INTO found_account_id FROM gp_accounts WHERE user = found_user_id LIMIT 1;
			ELSE
				SELECT a.id INTO found_account_id FROM gp_accounts a JOIN gp_orgs o ON a.org = o.id WHERE o.github_id = NEW.github_id LIMIT 1;
			END IF;

			IF found_account_id IS NOT NULL THEN
				INSERT INTO gp_credits (account_id, amount)
				VALUES (found_account_id, NEW.amount)
				ON DUPLICATE KEY UPDATE
				gp_credits.amount = COALESCE(gp_credits.amount, 0) + NEW.amount;
				SET NEW.consumed = TRUE;
			ELSE
				SET NEW.consumed = FALSE;
			END IF;
		END;
	`);

	await knex.raw(`
		CREATE OR REPLACE TRIGGER after_gp_credits_update
		AFTER UPDATE ON gp_credits
		FOR EACH ROW
		BEGIN
			IF NEW.amount < OLD.amount THEN
				UPDATE gp_credits_deductions
				SET amount = amount + (OLD.amount - NEW.amount)
				WHERE account_id = NEW.account_id AND date = CURRENT_DATE;

				IF ROW_COUNT() = 0 THEN
					INSERT INTO gp_credits_deductions (account_id, amount, date)
					VALUES (NEW.account_id, OLD.amount - NEW.amount, CURRENT_DATE)
					ON DUPLICATE KEY UPDATE
					amount = amount + (OLD.amount - NEW.amount);
				END IF;
			END IF;
		END;
	`);

	console.log('credits triggers recreated without user_id');

	await knex.raw(`ALTER TABLE gp_credits_deductions DROP FOREIGN KEY IF EXISTS gp_credits_deductions_user_id_foreign;`);
	await knex.raw(`ALTER TABLE gp_credits_deductions DROP INDEX IF EXISTS unique_user_id_date;`);
	await knex.raw(`ALTER TABLE gp_credits_deductions DROP INDEX IF EXISTS user_id_and_date_index;`);

	console.log('gp_credits_deductions user_id indexes dropped');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
