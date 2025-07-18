import { getUserPermissions, editPermissions } from '../migration-utils/permissions.js';

const COLLECTION_NAME = 'gp_credits_additions';
const FIELDS_TO_ADD = [ 'reason', 'meta' ];
const FIELDS_TO_REMOVE = [ 'comment', 'adopted_probe' ];

export async function up () {
	const { readPermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(readPermissions, FIELDS_TO_ADD, FIELDS_TO_REMOVE);
	console.log(`User read permissions patched. Added '${FIELDS_TO_ADD.join(', ')}' to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
