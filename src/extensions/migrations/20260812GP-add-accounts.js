// An account is the owner of every data item - either a user or an org. Give one to each of them.
export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_accounts ADD CONSTRAINT IF NOT EXISTS gp_accounts_user_xor_org CHECK ((user IS NULL) != (org IS NULL));`);

	await knex.raw(`
		CREATE OR REPLACE TRIGGER directus_users_create_account AFTER INSERT ON directus_users
		FOR EACH ROW INSERT IGNORE INTO gp_accounts (id, user) VALUES (UUID(), NEW.id);
	`);

	// Sponsorship credits of an org that didn't exist yet are assigned to it on creation.
	await knex.raw(`
		CREATE OR REPLACE TRIGGER gp_orgs_create_account AFTER INSERT ON gp_orgs
		FOR EACH ROW
		BEGIN
			DECLARE new_account_id CHAR(36);
			DECLARE unclaimed_amount BIGINT;

			SET new_account_id = UUID();
			INSERT INTO gp_accounts (id, org) VALUES (new_account_id, NEW.id);

			SELECT SUM(amount) INTO unclaimed_amount FROM gp_credits_additions WHERE github_id = NEW.github_id AND consumed = FALSE;

			IF unclaimed_amount IS NOT NULL THEN
				UPDATE gp_credits_additions SET consumed = TRUE WHERE github_id = NEW.github_id AND consumed = FALSE;
				INSERT INTO gp_credits (account_id, amount) VALUES (new_account_id, unclaimed_amount);
			END IF;
		END;
	`);

	console.log('account triggers created');

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
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
