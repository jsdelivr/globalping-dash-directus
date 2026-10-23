import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

export async function up () {
	const { updatePermissions } = await getUserPermissions('gp_orgs');
	await editPermissions(updatePermissions, [ 'extra_adoption_tokens' ]);
	console.log('gp_orgs update permission patched. Added extra_adoption_tokens');
}

export async function down () {
	const { updatePermissions } = await getUserPermissions('gp_orgs');
	await editPermissions(updatePermissions, [], [ 'extra_adoption_tokens' ]);
}
