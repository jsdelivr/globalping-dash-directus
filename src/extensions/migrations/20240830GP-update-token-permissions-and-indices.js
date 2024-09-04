import { getUserPermissions, updatePermissions } from '../migration-utils.js';

const COLLECTION_NAME = 'gp_tokens';

export async function up (knex) {
	const permissions = await getUserPermissions(COLLECTION_NAME);

	await updatePermissions({
		...permissions.createPermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await updatePermissions({
		...permissions.readPermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await updatePermissions({
		...permissions.updatePermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await updatePermissions({
		...permissions.deletePermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	console.log(`User token permissions patched.`);

	await knex.raw(`ALTER TABLE gp_tokens DROP INDEX value_index;`);
	await knex.raw(`ALTER TABLE gp_tokens ADD INDEX parent_index (parent);`);

	console.log(`Indices updated.`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
