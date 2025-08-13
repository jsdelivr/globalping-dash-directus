import { getContinentByCountry, getContinentName, getRegionByCountry, getCountryByIso, getStateNameByIso } from './location/location.js';

type Probe = {
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
};

export const getResetLocationFields = (probe: Probe) => {
	if (!probe.originalLocation) {
		return {
			city: null,
			country: null,
			countryName: null,
			state: null,
			stateName: null,
			continent: null,
			continentName: null,
			region: null,
			latitude: null,
			longitude: null,
			originalLocation: null,
			customLocation: null,
		};
	}

	const country = probe.originalLocation.country;
	const state = probe.originalLocation.state;
	const continent = getContinentByCountry(country);

	return {
		city: probe.originalLocation.city,
		country,
		countryName: getCountryByIso(country),
		state,
		stateName: state ? getStateNameByIso(state) : null,
		continent,
		continentName: getContinentName(continent),
		region: getRegionByCountry(country),
		latitude: probe.originalLocation.latitude,
		longitude: probe.originalLocation.longitude,
		originalLocation: null,
		customLocation: null,
	};
};

export const getResetUserFields = (probe: Probe) => ({
	...getResetLocationFields(probe),
	name: null,
	userId: null,
	tags: [],
});
