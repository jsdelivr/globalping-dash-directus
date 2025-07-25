import _ from 'lodash';
import { countries } from 'countries-list';
import { continents } from './continents.js';
import { regions } from './regions.js';

export const getContinentByCountry = (country: string): string => {
	const countryInfo = countries[country as keyof typeof countries];

	if (!countryInfo) {
		throw new Error(`country information associated with an iso code "${country}" not found`);
	}

	return countryInfo.continent;
};

export const getContinentName = (key: string): string => {
	const continent = continents[key as keyof typeof continents];

	if (!continent) {
		throw new Error(`continent not found ${key}`);
	}

	return continent;
};

const countryToRegionMap = new Map(_.flatMap(regions, (v, r) => v.map(c => [ c, r ])));

export const getRegionByCountry = (country: string): string => {
	const region = countryToRegionMap.get(country);

	if (!region) {
		throw new Error(`regions associated with a country "${country}" not found`);
	}

	return region;
};
