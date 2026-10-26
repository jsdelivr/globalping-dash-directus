export async function up (knex) {
	await knex.raw(`ALTER TABLE gp_org_members ADD UNIQUE INDEX IF NOT EXISTS gp_org_members_org_user_unique (org, user);`);

	await knex.raw(`
		CREATE OR REPLACE TRIGGER gp_org_members_clean_up_tokens AFTER DELETE ON gp_org_members
		FOR EACH ROW
		BEGIN
			DELETE FROM gp_tokens
			WHERE user_created = OLD.user AND account_id = (SELECT id FROM gp_accounts WHERE org = OLD.org);

			DELETE FROM gp_apps_approvals
			WHERE user_created = OLD.user AND account_id = (SELECT id FROM gp_accounts WHERE org = OLD.org);
		END;
	`);

	await knex.raw(`
		CREATE OR REPLACE TRIGGER gp_org_members_clean_up_tokens_on_demotion AFTER UPDATE ON gp_org_members
		FOR EACH ROW
		BEGIN
			IF NEW.role = 'viewer' AND OLD.role <> 'viewer' THEN
				DELETE FROM gp_tokens
				WHERE user_created = NEW.user AND account_id = (SELECT id FROM gp_accounts WHERE org = NEW.org);

				DELETE FROM gp_apps_approvals
				WHERE user_created = NEW.user AND account_id = (SELECT id FROM gp_accounts WHERE org = NEW.org);
			END IF;
		END;
	`);

	console.log('gp_org_members constraint and clean up triggers created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
