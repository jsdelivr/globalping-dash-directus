import { getUserPermissions, editPermissions } from '../migration-utils.js';

const COLLECTION_NAME = 'gp_probes';
const FIELDS_TO_REMOVE = [];

export async function up () {
	const { readPermissions, updatePermissions } = await getUserPermissions(COLLECTION_NAME);
	await editPermissions(readPermissions, [ 'possibleCountries' ], FIELDS_TO_REMOVE);
	await editPermissions(updatePermissions, [ 'country' ], FIELDS_TO_REMOVE);
	console.log(`User read permissions patched. Added 'possibleCountries' to the ${COLLECTION_NAME}`);
	console.log(`User update permissions patched. Added 'country' to the ${COLLECTION_NAME}`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
