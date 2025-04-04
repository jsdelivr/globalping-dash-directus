import type { HookExtensionContext } from '@directus/extensions';
import { geonamesCache, getKey } from './geonames-cache.js';
import type { Fields } from './index.js';

export const resetCustomLocation = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
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

export const updateCustomLocationData = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
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
		latitude: Math.round(Number(city.lat) * 100) / 100,
		longitude: Math.round(Number(city.lng) * 100) / 100,
		state,
		isCustomCity: true,
	}, {
		emitEvents: false,
	});
};

export const resetUserDefinedData = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, {
		name: null,
		userId: null,
		tags: [],
		isCustomCity: false,
		countryOfCustomCity: null,
	}, {
		emitEvents: false,
	});
};
