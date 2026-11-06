// Point every data item at its owner account.
export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_credits_deductions ADD UNIQUE INDEX IF NOT EXISTS gp_credits_deductions_account_id_date_unique (account_id, date);`);

	// The credits triggers resolve an account, so an org can hold a balance too.
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

	console.log('account_id triggers created');

	await knex.raw(`ALTER TABLE gp_apps_approvals ADD UNIQUE INDEX IF NOT EXISTS gp_apps_approvals_account_app_unique (user_created, app, account_id);`);

	console.log('gp_apps_approvals unique key moved to the account');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
