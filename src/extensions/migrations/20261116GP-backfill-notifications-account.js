const USER_TYPES = [ 'welcome', 'default_tag_change' ];

export async function up (knex) {
	const [{ affectedRows }] = await knex.raw(`
		UPDATE directus_notifications n
		JOIN gp_accounts a ON a.user = n.recipient
		SET n.account_id = a.id
		WHERE n.account_id IS NULL AND n.type NOT IN (?, ?)
	`, USER_TYPES);

	console.log(`Set the personal account on ${affectedRows} notifications.`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
