import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import { getDefaultProbeName } from '../../../lib/src/default-probe-name.js';
import { getContinentByCountry, getContinentName, getRegionByCountry } from '../../../lib/src/location/location.js';
import { geonamesCache, getKey } from './geonames-cache.js';
import { UserNotFoundError, type Fields } from './index.js';

export const resetCustomLocation = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, {
		country: null,
		countryName: null,
		city: null,
		latitude: null,
		longitude: null,
		state: null,
		stateName: null,
		continent: null,
		continentName: null,
		region: null,
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
	const countryName = city.countryName;
	const state = city.countryCode === 'US' ? city.adminCode1 : null;
	const stateName = city.countryCode === 'US' ? city.adminName1 : null;
	const continent = getContinentByCountry(country);
	const continentName = getContinentName(continent);
	const region = getRegionByCountry(country);
	const latitude = Math.round(Number(city.lat) * 100) / 100;
	const longitude = Math.round(Number(city.lng) * 100) / 100;

	await adoptedProbesService.updateMany(keys, {
		state,
		stateName,
		latitude,
		longitude,
		countryName,
		continent,
		continentName,
		region,
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

export const updateProbeName = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	if (!accountability || !accountability.user) {
		throw new UserNotFoundError();
	}

	if (keys.length > 1) {
		throw new Error('Batch name reset is not supported.');
	}

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	const probe = await adoptedProbesService.readOne(keys[0]);
	const name = await getDefaultProbeName(probe.userId, probe, context);
	fields.name = name;
};
