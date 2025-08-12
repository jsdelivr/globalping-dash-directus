import type { HookExtensionContext } from '@directus/extensions';
import _ from 'lodash';
import { getContinentByCountry, getContinentName, getRegionByCountry, getCountryByIso, getStateNameByIso } from '../../../lib/src/location/location.js';
import { type City } from './update-with-user.js';
import { type Fields, type Probe } from './index.js';

export const resetLocationFields = (fields: Fields, probe: Probe) => {
	if (!probe.originalLocation) { return; }

	const country = probe.originalLocation.country;
	const state = probe.originalLocation.state;
	const continent = getContinentByCountry(country);

	_.assign(fields, {
		country,
		countryName: getCountryByIso(country),
		city: probe.originalLocation.city,
		state,
		stateName: state ? getStateNameByIso(state) : null,
		continent,
		continentName: getContinentName(continent),
		region: getRegionByCountry(country),
		latitude: probe.originalLocation.latitude,
		longitude: probe.originalLocation.longitude,
		originalLocation: null,
		customLocation: null,
	});

	return fields;
};

export const patchCustomLocationRootFields = (fields: Fields, city: City, originalProbe: Probe) => {
	const country = city.countryCode;
	const countryName = city.countryName;
	const state = city.countryCode === 'US' ? city.adminCode1 : null;
	const stateName = city.countryCode === 'US' ? city.adminName1 : null;
	const continent = getContinentByCountry(country);
	const continentName = getContinentName(continent);
	const region = getRegionByCountry(country);
	const latitude = Math.round(Number(city.lat) * 100) / 100;
	const longitude = Math.round(Number(city.lng) * 100) / 100;

	_.assign(fields, {
		countryName,
		latitude,
		longitude,
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
		name: null,
		userId: null,
		tags: [],
		...resetLocationFields({}, probe),
	})), { emitEvents: false });
};
