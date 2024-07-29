import { getUserPermissions, updatePermissions } from '../migration-utils.js';

const COLLECTION_NAME = 'gp_credits';
const FIELDS_TO_ADD = [ 'user_id' ];
const FIELDS_TO_REMOVE = [];

export async function up () {
	const { readPermissions } = await getUserPermissions(COLLECTION_NAME);
	await updatePermissions(readPermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	console.log(`User read permissions patched. Added ${FIELDS_TO_ADD.join(',')} to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
