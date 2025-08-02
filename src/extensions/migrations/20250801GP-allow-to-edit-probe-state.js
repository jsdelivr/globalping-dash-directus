import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

const COLLECTION_NAME = 'gp_probes';
const FIELDS_TO_ADD = [ 'state' ];
const FIELDS_TO_REMOVE = [];

export async function up () {
	const { updatePermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(updatePermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	console.log(`User update permissions patched. Added '${FIELDS_TO_ADD.join(', ')}' to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
