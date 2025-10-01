import { getContinentByCountry, getContinentName, getRegionByCountry, getCountryByIso, getStateNameByIso } from './location/location.js';

type Probe = {
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	systemTags: string[];
};

export const getResetLocationFields = (probe: Probe) => {
	if (!probe.originalLocation) {
		return {
			originalLocation: null,
			customLocation: null,
		};
	}

	const country = probe.originalLocation.country;
	const state = probe.originalLocation.state ?? null;
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
	tags: [] as string[],
	systemTags: probe.systemTags.filter(tag => !tag.startsWith('u-')),
});
