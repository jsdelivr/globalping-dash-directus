import { directusRequest } from '../migration-utils/directus-request.js';

const BANNER_2X_PRESET = { key: 'banner-2x', fit: 'cover', width: 2448, height: 400, withoutEnlargement: true, quality: 90, format: 'webp' };

export async function up () {
	const settings = await directusRequest('/settings?fields=storage_asset_presets');
	const otherPresets = (settings.storage_asset_presets ?? []).filter(preset => preset.key !== BANNER_2X_PRESET.key);

	await directusRequest('/settings', 'PATCH', {
		storage_asset_presets: [ ...otherPresets, BANNER_2X_PRESET ],
	});

	console.log('Banner 2x asset preset created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
