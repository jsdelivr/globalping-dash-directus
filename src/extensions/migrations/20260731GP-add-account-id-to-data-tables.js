// Point every data item at its owner account.
export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_credits_deductions ADD UNIQUE INDEX IF NOT EXISTS gp_credits_deductions_account_id_date_unique (account_id, date);`);

	// PHASE4: remove.
	await knex.raw(`
		CREATE OR REPLACE TRIGGER gp_tokens_fulfill_account BEFORE INSERT ON gp_tokens
		FOR EACH ROW
		BEGIN
			IF NEW.account_id IS NULL AND NEW.user_created IS NOT NULL THEN
				SET NEW.account_id = (SELECT id FROM gp_accounts WHERE user = NEW.user_created LIMIT 1);
			END IF;
		END;
	`);

	// PHASE4: remove.
	await knex.raw(`
		CREATE OR REPLACE TRIGGER gp_apps_approvals_fulfill_account BEFORE INSERT ON gp_apps_approvals
		FOR EACH ROW
		BEGIN
			IF NEW.user_created IS NULL THEN
				SET NEW.user_created = NEW.user;
			END IF;

			IF NEW.user IS NULL THEN
				SET NEW.user = NEW.user_created;
			END IF;

			IF NEW.account_id IS NULL AND NEW.user_created IS NOT NULL THEN
				SET NEW.account_id = (SELECT id FROM gp_accounts WHERE user = NEW.user_created LIMIT 1);
			END IF;
		END;
	`);

	// The credits triggers now resolve an account instead of a user, so an org can hold a balance too.
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
				INSERT INTO gp_credits (user_id, account_id, amount)
				VALUES (found_user_id, found_account_id, NEW.amount)
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
					INSERT INTO gp_credits_deductions (user_id, account_id, amount, date)
					VALUES (NEW.user_id, NEW.account_id, OLD.amount - NEW.amount, CURRENT_DATE)
					ON DUPLICATE KEY UPDATE
					amount = amount + (OLD.amount - NEW.amount);
				END IF;
			END IF;
		END;
	`);

	console.log('account_id triggers created');

	await knex.raw(`UPDATE gp_probes p JOIN gp_accounts a ON a.user = p.userId SET p.account_id = a.id WHERE p.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_tokens t JOIN gp_accounts a ON a.user = t.user_created SET t.account_id = a.id WHERE t.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_apps_approvals ap SET ap.user_created = ap.user WHERE ap.user_created IS NULL;`);
	await knex.raw(`UPDATE gp_apps_approvals ap JOIN gp_accounts a ON a.user = ap.user SET ap.account_id = a.id WHERE ap.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_credits c JOIN gp_accounts a ON a.user = c.user_id SET c.account_id = a.id WHERE c.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_credits_deductions d JOIN gp_accounts a ON a.user = d.user_id SET d.account_id = a.id WHERE d.account_id IS NULL;`);

	await knex.raw(`
		UPDATE gp_credits
		SET low_credits_notified = IF(low_credits_notified = 1 AND user_id IS NOT NULL, JSON_ARRAY(user_id), JSON_ARRAY())
	`);

	console.log('account_id backfilled');

	await knex.raw(`ALTER TABLE gp_apps_approvals DROP INDEX IF EXISTS unique_user_app;`);
	await knex.raw(`ALTER TABLE gp_apps_approvals ADD UNIQUE INDEX IF NOT EXISTS gp_apps_approvals_account_app_unique (user_created, app, account_id);`);

	console.log('gp_apps_approvals unique key moved to the account');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
