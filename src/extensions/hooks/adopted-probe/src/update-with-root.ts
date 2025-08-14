import type { HookExtensionContext } from '@directus/extensions';
import _ from 'lodash';
import { getContinentByCountry, getContinentName, getCountryByIso, getRegionByCountry, getStateNameByIso } from '../../../lib/src/location/location.js';
import { getResetUserFields } from '../../../lib/src/reset-fields.js';
import { type City } from './update-with-user.js';
import { type Fields, type Probe, payloadError } from './index.js';

export const patchCustomLocationRootFields = (fields: Fields, keys: string[], city: City, originalProbe: Probe) => {
	if (keys.length > 1) {
		throw payloadError('Batch probe location update is not supported.');
	}

	const country = city.countryCode;
	const state = city.countryCode === 'US' ? city.adminCode1 : null;
	const stateName = state ? getStateNameByIso(state) : null;
	const continent = getContinentByCountry(country);
	const continentName = getContinentName(continent);
	const region = getRegionByCountry(country);
	const latitude = Math.round(Number(city.lat) * 100) / 100;
	const longitude = Math.round(Number(city.lng) * 100) / 100;

	_.assign(fields, {
		city: city.toponymName,
		country,
		countryName: getCountryByIso(country),
		latitude,
		longitude,
		state,
		stateName,
		continent,
		continentName,
		region,
		originalLocation: originalProbe.originalLocation || {
			country: originalProbe.country,
			city: originalProbe.city,
			latitude: originalProbe.latitude,
			longitude: originalProbe.longitude,
			state: originalProbe.state,
		},
		customLocation: {
			country,
			city: city.toponymName,
			latitude,
			longitude,
			state,
		},
	});
};

export const resetUserDefinedData = async (_fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
	});

	const probes = await adoptedProbesService.readMany(keys) as Probe[];

	await adoptedProbesService.updateBatch(probes.map(probe => ({
		id: probe.id,
		...getResetUserFields(probe),
	})), { emitEvents: false });
};
