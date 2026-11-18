import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

// The default account is the user's own account or the account of an org they are a member of.
const DEFAULT_ACCOUNT_VALIDATION = {
	_or: [
		{ default_account: { _null: true } },
		{ default_account: { _in: [ '$CURRENT_USER.account.id', '$CURRENT_USER.memberships.org.account.id' ] } },
	],
};

const USER_FIELDS = [ 'default_account' ];
const ORG_FIELDS = [ 'website', 'description' ];

export async function up () {
	const users = await getUserPermissions('directus_users');
	await editPermissions(users.readPermissions, USER_FIELDS);
	await editPermissions({ ...users.updatePermissions, validation: DEFAULT_ACCOUNT_VALIDATION }, USER_FIELDS);

	const orgs = await getUserPermissions('gp_orgs');
	await editPermissions(orgs.readPermissions, ORG_FIELDS);
	await editPermissions(orgs.updatePermissions, ORG_FIELDS);

	console.log(`User permissions patched. Added ${USER_FIELDS.join(',')} to directus_users and ${ORG_FIELDS.join(',')} to gp_orgs`);
}

export async function down () {
	const users = await getUserPermissions('directus_users');
	await editPermissions(users.readPermissions, [], USER_FIELDS);
	await editPermissions({ ...users.updatePermissions, validation: null }, [], USER_FIELDS);

	const orgs = await getUserPermissions('gp_orgs');
	await editPermissions(orgs.readPermissions, [], ORG_FIELDS);
	await editPermissions(orgs.updatePermissions, [], ORG_FIELDS);

	console.log(`User permissions patched. Removed ${USER_FIELDS.join(',')} from directus_users and ${ORG_FIELDS.join(',')} from gp_orgs`);
}
