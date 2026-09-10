import { getUserPermissions, getUserPolicyId, createPermissions, editPermissions } from '../migration-utils/permissions.js';

export async function up () {
	const accounts = await getUserPermissions('gp_accounts');

	if (!accounts.readPermissions) {
		await createPermissions([{
			collection: 'gp_accounts',
			action: 'read',
			policy: await getUserPolicyId(),
			permissions: {
				_or: [
					{ user: { _eq: '$CURRENT_USER' } },
					{ org: { members: { user: { _eq: '$CURRENT_USER' } } } },
				],
			},
			fields: [ 'id', 'user', 'org' ],
		}]);
	}

	console.log('gp_accounts read permissions created');

	// The aliases the dashboard reads them through: its own account, and the orgs it may act for.
	const users = await getUserPermissions('directus_users');
	await editPermissions(users.readPermissions, [ 'account', 'memberships' ]);
	console.log('directus_users read fields updated');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
