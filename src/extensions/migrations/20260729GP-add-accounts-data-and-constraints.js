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

	console.log('constraints added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
