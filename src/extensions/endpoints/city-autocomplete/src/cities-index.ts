import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import _ from 'lodash';
import { getStateNameByIso } from '../../../lib/src/location/location.js';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';
import { FILENAME, type City } from './download-cities.js';

type CityResponse = {
	name: string;
	country: string;
	state?: string;
};

export class CitiesIndex {
	public isInitialized = false;
	private initializePromise: Promise<void> | null = null;
	private citiesOfCountries: Record<string, City[]> = {};

	constructor (private readonly context: EndpointExtensionContext) {}

	init () {
		if (this.initializePromise) {
			return this.initializePromise;
		}

		this.initializePromise = this.initCitiesIndex();
		return this.initializePromise;
	}

	searchCities (countries: string[], query: string, limit: number) {
		const resultsByCountry: CityResponse[][] = [];
		const asciiQuery = normalizeCityName(query).toLowerCase().replace(/\b(?:city)\b|(?:shi)$/g, '');

		for (const country of countries) {
			if (!this.citiesOfCountries[country]) {
				continue;
			}

			const cities = this.citiesOfCountries[country];
			const results: CityResponse[] = [];

			for (let i = 0; i < cities.length; i++) {
				if (!asciiQuery || cities[i]!.searchValue.startsWith(asciiQuery)) {
					results.push(cities[i]!);

					if (results.length >= limit) {
						break;
					}
				}
			}

			resultsByCountry.push(results);
		}

		const cities = _(resultsByCountry)
			.unzip()
			.flatten()
			.filter(Boolean)
			.uniqWith((a, b) => a.name === b.name && a.state === b.state && a.country === b.country) // There may be multiple cities with the same name, but different states, but we can't difference between them at the moment, so we just show one.
			.take(limit)
			.map(({ name, country, state }) => ({
				name,
				country,
				state: state ?? null,
				stateName: state ? getStateNameByIso(state) : null,
			}))
			.value();

		return cities;
	}

	private async initCitiesIndex () {
		const { logger } = this.context;
		logger.info('Initializing cities index...');
		const __dirname = dirname(fileURLToPath(import.meta.url));
		const filePath = path.resolve(__dirname, `../data/${FILENAME}`);
		const file = await fs.promises.readFile(filePath, 'utf-8');
		this.citiesOfCountries = JSON.parse(file);
		this.isInitialized = true;
		logger.info('Cities index initialized');
	}
}

let citiesIndex: CitiesIndex | null = null;

export const getCitiesIndex = (context: EndpointExtensionContext) => {
	if (!citiesIndex) {
		citiesIndex = new CitiesIndex(context);
	}

	return citiesIndex;
};
