import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import csvParser from 'csv-parser';
import _ from 'lodash';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';
import { FILENAME } from './actions/download-cities.js';

type CityCsvRow = {
	geonameId: string;
	name: string;
	asciiName: string;
	alternateNames: string;
	latitude: string;
	longitude: string;
	featureClass: string;
	featureCode: string;
	countryCode: string;
	cc2: string;
	admin1Code: string;
	admin2Code: string;
	admin3Code: string;
	admin4Code: string;
	population: string;
	elevation: string;
	dem: string;
	timezone: string;
	modificationDate: string;
};

type CityInIndex = {
	name: string;
	country: string;
	state?: string;
	searchValue: string;
};

type City = {
	name: string;
	country: string;
	state?: string;
};

export class CitiesIndex {
	public isInitialized = false;
	private initializePromise: Promise<void> | null = null;
	private citiesOfCountry = new Map<string, CityInIndex[]>();

	constructor (private readonly context: EndpointExtensionContext) {}

	async init () {
		if (this.initializePromise) {
			return this.initializePromise;
		}

		this.initializePromise = this.initCitiesIndex();
		return this.initializePromise;
	}

	searchCities (countries: string[], query: string, limit: number) {
		const resultsByCountry: City[][] = [];

		for (const country of countries) {
			if (!this.citiesOfCountry.has(country)) {
				continue;
			}

			const cities = this.citiesOfCountry.get(country)!;
			const results: City[] = [];

			for (let i = 0; i < cities.length; i++) {
				if (cities[i]!.searchValue.startsWith(query)) {
					results.push(cities[i]!);

					if (results.length >= limit) {
						break;
					}
				}
			}

			resultsByCountry.push(results);
		}

		const cities = _(resultsByCountry).unzip().flatten().filter(Boolean).take(limit).map(({ name, country, state }) => ({ name, country, state: state ?? null })).value();
		return cities;
	}

	private async initCitiesIndex () {
		const { logger } = this.context;
		logger.info('Building cities index...');
		const cities = await this.readCitiesCsvFile();
		cities.sort((a, b) => b.population - a.population);

		for (const city of cities) {
			const name = normalizeCityName(city.name);

			if (!this.citiesOfCountry.has(city.country)) {
				this.citiesOfCountry.set(city.country, []);
			}

			this.citiesOfCountry.get(city.country)!.push({
				searchValue: name.toLowerCase(),
				name,
				country: city.country,
				...city.state ? { state: city.state } : {},
			});
		}

		this.isInitialized = true;
	}

	private readCitiesCsvFile = async () => new Promise<(City & { population: number })[]>((resolve, reject) => {
		const cities: (City & { population: number })[] = [];
		const __dirname = dirname(fileURLToPath(import.meta.url));
		const filePath = path.resolve(__dirname, `../data/${FILENAME}`);

		fs.createReadStream(filePath)
			.pipe(csvParser({
				headers: [ 'geonameId', 'name', 'asciiName', 'alternateNames', 'latitude', 'longitude', 'featureClass', 'featureCode', 'countryCode', 'cc2', 'admin1Code', 'admin2Code', 'admin3Code', 'admin4Code', 'population', 'elevation', 'dem', 'timezone', 'modificationDate' ],
				separator: '\t',
			}))
			.on('data', (city: CityCsvRow) => {
				if (city.featureCode !== 'PPLX') {
					cities.push({
						name: city.name,
						country: city.countryCode,
						population: parseInt(city.population, 10) || 0,
						...city.countryCode === 'US' ? { state: city.admin1Code } : {},
					});
				}
			})
			.on('end', () => resolve(cities))
			.on('error', (err: Error) => reject(err));
	});
}

let citiesIndex: CitiesIndex | null = null;

export const getCitiesIndex = (context: EndpointExtensionContext) => {
	if (!citiesIndex) {
		citiesIndex = new CitiesIndex(context);
	}

	return citiesIndex;
};
