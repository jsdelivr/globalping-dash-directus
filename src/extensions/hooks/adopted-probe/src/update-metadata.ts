import type { HookExtensionContext } from '@directus/extensions';
import { geonamesCache, getKey } from './geonames-cache.js';
import type { Fields } from './index.js';

export const resetMetadata = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_adopted_probes', {
		database,
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, {
		latitude: null,
		longitude: null,
		state: null,
		isCustomCity: false,
		countryOfCustomCity: null,
	}, {
		emitEvents: false,
	});
};

export const updateMetadata = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_adopted_probes', {
		database,
		schema: await getSchema(),
	});

	const city = geonamesCache.get(getKey(keys));

	if (!city) {
		throw new Error('geonames result not found');
	}

	const state = city.countryCode === 'US' ? city.adminCode1 : null;

	await adoptedProbesService.updateMany(keys, {
		countryOfCustomCity: city.countryCode,
		latitude: city.lat,
		longitude: city.lng,
		state,
		isCustomCity: true,
	}, {
		emitEvents: false,
	});
};
