export async function up (knex) {
	await knex.raw(`
		INSERT INTO gp_accounts (id, user)
		SELECT UUID(), u.id FROM directus_users u
		WHERE NOT EXISTS (SELECT 1 FROM gp_accounts a WHERE a.user = u.id);
	`);

	await knex.raw(`
		INSERT INTO gp_accounts (id, org)
		SELECT UUID(), o.id FROM gp_orgs o
		WHERE NOT EXISTS (SELECT 1 FROM gp_accounts a WHERE a.org = o.id);
	`);

	console.log('gp_accounts backfilled');

	await knex.raw(`UPDATE gp_probes p JOIN gp_accounts a ON a.user = p.userId SET p.account_id = a.id WHERE p.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_tokens t JOIN gp_accounts a ON a.user = t.user_created SET t.account_id = a.id WHERE t.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_apps_approvals ap SET ap.user_created = ap.user WHERE ap.user_created IS NULL;`);
	await knex.raw(`UPDATE gp_apps_approvals ap JOIN gp_accounts a ON a.user = ap.user SET ap.account_id = a.id WHERE ap.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_credits c JOIN gp_accounts a ON a.user = c.user_id SET c.account_id = a.id WHERE c.account_id IS NULL;`);
	await knex.raw(`UPDATE gp_credits_deductions d JOIN gp_accounts a ON a.user = d.user_id SET d.account_id = a.id WHERE d.account_id IS NULL;`);

	console.log('account_id backfilled');

	await knex.raw(`
		CREATE TRIGGER IF NOT EXISTS directus_users_create_account AFTER INSERT ON directus_users
		FOR EACH ROW INSERT IGNORE INTO gp_accounts (id, user) VALUES (UUID(), NEW.id);
	`);

	await knex.raw(`
		CREATE TRIGGER IF NOT EXISTS gp_orgs_create_account AFTER INSERT ON gp_orgs
		FOR EACH ROW INSERT IGNORE INTO gp_accounts (id, org) VALUES (UUID(), NEW.id);
	`);

	console.log('account triggers created');

	await knex.raw(`ALTER TABLE gp_accounts ADD CONSTRAINT IF NOT EXISTS gp_accounts_user_xor_org CHECK ((user IS NULL) != (org IS NULL));`);
	await knex.raw(`ALTER TABLE gp_org_members ADD UNIQUE INDEX IF NOT EXISTS gp_org_members_org_user_unique (org, user);`);
	await knex.raw(`ALTER TABLE gp_credits_deductions ADD UNIQUE INDEX IF NOT EXISTS gp_credits_deductions_account_id_date_unique (account_id, date);`);

	console.log('constraints added');

	await knex.raw(`DROP TRIGGER IF EXISTS after_gp_credits_additions_insert;`);

	await knex.raw(`
		CREATE TRIGGER after_gp_credits_additions_insert
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

	await knex.raw(`DROP TRIGGER IF EXISTS after_gp_credits_update;`);

	await knex.raw(`
		CREATE TRIGGER after_gp_credits_update
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

	console.log('credits triggers updated to fulfill account_id');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
