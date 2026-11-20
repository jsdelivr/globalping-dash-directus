import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

export async function up () {
	const users = await getUserPermissions('directus_users');
	await editPermissions(users.readPermissions, [], [ 'github_organizations' ]);

	const probes = await getUserPermissions('gp_probes');
	await editPermissions(probes.readPermissions, [], [ 'userId' ]);
	await editPermissions({ ...probes.updatePermissions, validation: { account_id: { _null: true } } }, [], [ 'userId' ]);

	const credits = await getUserPermissions('gp_credits');
	await editPermissions(credits.readPermissions, [], [ 'user_id' ]);

	const deductions = await getUserPermissions('gp_credits_deductions');
	await editPermissions(deductions.readPermissions, [], [ 'user_id' ]);

	console.log('Legacy owner fields removed from the user permissions');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
