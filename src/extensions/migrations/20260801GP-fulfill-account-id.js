// Fallback for the rows created outside our extensions (gp-auth) or before the hooks are deployed.
export async function up (knex) {
	await knex.raw(`
		CREATE TRIGGER IF NOT EXISTS gp_probes_fulfill_account BEFORE INSERT ON gp_probes
		FOR EACH ROW
		BEGIN
			IF NEW.account_id IS NULL AND NEW.userId IS NOT NULL THEN
				SET NEW.account_id = (SELECT id FROM gp_accounts WHERE user = NEW.userId LIMIT 1);
			END IF;
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER IF NOT EXISTS gp_tokens_fulfill_account BEFORE INSERT ON gp_tokens
		FOR EACH ROW
		BEGIN
			IF NEW.account_id IS NULL AND NEW.user_created IS NOT NULL THEN
				SET NEW.account_id = (SELECT id FROM gp_accounts WHERE user = NEW.user_created LIMIT 1);
			END IF;
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER IF NOT EXISTS gp_apps_approvals_fulfill_account BEFORE INSERT ON gp_apps_approvals
		FOR EACH ROW
		BEGIN
			IF NEW.user_created IS NULL THEN
				SET NEW.user_created = NEW.user;
			END IF;

			IF NEW.account_id IS NULL AND NEW.user_created IS NOT NULL THEN
				SET NEW.account_id = (SELECT id FROM gp_accounts WHERE user = NEW.user_created LIMIT 1);
			END IF;
		END;
	`);

	console.log('account_id fulfillment triggers created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
