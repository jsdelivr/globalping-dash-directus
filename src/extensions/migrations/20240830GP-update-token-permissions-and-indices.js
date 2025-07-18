import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

const COLLECTION_NAME = 'gp_tokens';

export async function up (knex) {
	const permissions = await getUserPermissions(COLLECTION_NAME);

	await editPermissions({
		...permissions.createPermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await editPermissions({
		...permissions.readPermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await editPermissions({
		...permissions.updatePermissions,
		permissions: {
			_and: [
				{ user_created: { _eq: '$CURRENT_USER' } },
				{ app_id: { _null: true } },
			],
		},
	}, [], []);

	await editPermissions({
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
