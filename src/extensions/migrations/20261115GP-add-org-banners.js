import { getUserPermissions, editPermissions, getUserPolicyId, getPublicPolicyId, createPermissions } from '../migration-utils/permissions.js';
import { directusRequest } from '../migration-utils/directus-request.js';

const BANNERS_FOLDER_ID = '5f0b6a52-3c1e-4b8e-9d6a-1c2f7e4a9b30'; // Same id is specified in lib/src/constants.ts.

const BANNER_PRESET = { key: 'banner', fit: 'cover', width: 1224, height: 200, quality: 80, format: 'webp' };

const getOtherPresets = async () => {
	const settings = await directusRequest('/settings?fields=storage_asset_presets');
	return (settings.storage_asset_presets ?? []).filter(preset => preset.key !== BANNER_PRESET.key);
};

export async function up () {
	const folders = await directusRequest(`/folders?filter[id][_eq]=${BANNERS_FOLDER_ID}`);
	!folders.length && await directusRequest('/folders', 'POST', { id: BANNERS_FOLDER_ID, name: 'Organization banners' });

	// Signed-in users don't get public permissions, so both policies need access.
	const policies = [ await getPublicPolicyId(), await getUserPolicyId() ];

	// /assets/:id needs only the id, so a folder listing shows nothing else.
	await createPermissions(policies.map(policy => ({
		collection: 'directus_files',
		action: 'read',
		policy,
		permissions: { folder: { _eq: BANNERS_FOLDER_ID } },
		fields: [ 'id' ],
	})));

	await directusRequest('/settings', 'PATCH', {
		storage_asset_transform: 'presets',
		storage_asset_presets: [ ...await getOtherPresets(), BANNER_PRESET ],
	});

	const orgs = await getUserPermissions('gp_orgs');
	await editPermissions(orgs.readPermissions, [ 'banner' ]);

	console.log('Organization banners folder, read permissions and asset preset created. Added banner to gp_orgs read permissions');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
