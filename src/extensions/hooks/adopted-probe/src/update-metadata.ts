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
		country: null,
		city: null,
		latitude: null,
		longitude: null,
		state: null,
		customLocation: null,
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

	const country = city.countryCode;
	const state = city.countryCode === 'US' ? city.adminCode1 : null;
	const latitude = Math.round(Number(city.lat) * 100) / 100;
	const longitude = Math.round(Number(city.lng) * 100) / 100;

	await adoptedProbesService.updateMany(keys, {
		state,
		latitude,
		longitude,
		customLocation: {
			country,
			city: city.toponymName,
			latitude,
			longitude,
			state,
		},
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
		customLocation: null,
	}, {
		emitEvents: false,
	});
};
