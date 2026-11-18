import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

const COLLECTION_NAME = 'gp_orgs';
const FIELDS_TO_ADD = [ 'default_role' ];
const DEFAULT_ROLE_VALIDATION = { default_role: { _in: [ 'viewer', 'member' ] } };

export async function up () {
	const { readPermissions, updatePermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(readPermissions, FIELDS_TO_ADD);
	await editPermissions({ ...updatePermissions, validation: DEFAULT_ROLE_VALIDATION }, FIELDS_TO_ADD);
	console.log(`User read and update permissions patched. Added ${FIELDS_TO_ADD.join(',')} to the ${COLLECTION_NAME}`);
}

export async function down () {
	const { readPermissions, updatePermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(readPermissions, [], FIELDS_TO_ADD);
	await editPermissions({ ...updatePermissions, validation: null }, [], FIELDS_TO_ADD);
	console.log(`User read and update permissions patched. Removed ${FIELDS_TO_ADD.join(',')} from the ${COLLECTION_NAME}`);
}
