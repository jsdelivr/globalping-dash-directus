import { getUserPermissions, updatePermissions } from '../migration-utils.js';

const COLLECTION_NAME = 'gp_adopted_probes';
const FIELDS_TO_ADD = [ 'systemTags' ];
const FIELDS_TO_REMOVE = [];

export async function up () {
	const { readPermissions } = await getUserPermissions(COLLECTION_NAME);
	await updatePermissions(readPermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	console.log(`User read permissions patched. Added ${FIELDS_TO_ADD.join(',')} to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
