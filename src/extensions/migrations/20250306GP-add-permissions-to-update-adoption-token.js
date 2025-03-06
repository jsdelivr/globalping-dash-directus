import { getUserPermissions, editPermissions } from '../migration-utils.js';

const COLLECTION_NAME = 'directus_users';
const FIELDS_TO_ADD = [ 'adoption_token' ];
const FIELDS_TO_REMOVE = [];

export async function up () {
	const { readPermissions, updatePermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(readPermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	await editPermissions(updatePermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	console.log(`User read and update permissions patched. Added ${FIELDS_TO_ADD.join(',')} to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
