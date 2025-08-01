import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import csvParser from 'csv-parser';
import { Index } from 'flexsearch';
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

type CityData = {
	geonameId: string;
	name: string;
	country: string;
	population: number;
};

type City = {
	name: string;
	country: string;
};

export class CitiesIndex {
	public isInitialized = false;
	private initializePromise: Promise<void> | null = null;
	private indexOptions = {
		tokenize: 'full',
		cache: true,
	} as const;

	private globalIndex = new Index(this.indexOptions);
	private countryToIndex = new Map<string, Index>();
	private idToCity = new Map<number, City>();

	constructor (private readonly context: EndpointExtensionContext) {}

	async init () {
		if (this.initializePromise) {
			return this.initializePromise;
		}

		this.initializePromise = this.initCitiesIndex();
		return this.initializePromise;
	}

	searchCities (countries: string[], query: string, limit: number): City[] {
		const results: City[] = [];

		if (countries.length === 0) {
			results.push(...this.searchInGlobalIndex(query, limit));
		} else {
			results.push(...this.searchInCountryIndexes(countries, query, limit));
		}

		this.moveMatchesAtTheBeginningToTheTop(results, query);

		return results;
	}

	private async initCitiesIndex () {
		const { logger } = this.context;
		const cities = await this.readCitiesCsvFile();
		cities.sort((a, b) => b.population - a.population);

		logger.info('Building cities index...');

		for (const city of cities) {
			const id = parseInt(city.geonameId, 10);
			const name = normalizeCityName(city.name);
			await this.globalIndex.addAsync(id, name);

			if (!this.countryToIndex.has(city.country)) {
				this.countryToIndex.set(city.country, new Index(this.indexOptions));
			}

			await this.countryToIndex.get(city.country)!.addAsync(id, name);
			this.idToCity.set(id, { name, country: city.country });
		}

		this.isInitialized = true;

		logger.info('The cities index was built successfully.');
	}

	private readCitiesCsvFile = async () => new Promise<CityData[]>((resolve, reject) => {
		const cities: CityData[] = [];
		const __dirname = dirname(fileURLToPath(import.meta.url));
		const filePath = path.resolve(__dirname, `../data/${FILENAME}`);

		fs.createReadStream(filePath)
			.pipe(csvParser({
				headers: [ 'geonameId', 'name', 'asciiName', 'alternateNames', 'latitude', 'longitude', 'featureClass', 'featureCode', 'countryCode', 'cc2', 'admin1Code', 'admin2Code', 'admin3Code', 'admin4Code', 'population', 'elevation', 'dem', 'timezone', 'modificationDate' ],
				separator: '\t',
			}))
			.on('data', (city: CityCsvRow) => {
				city.featureCode !== 'PPLX' && cities.push({ geonameId: city.geonameId, name: city.name, country: city.countryCode, population: parseInt(city.population, 10) || 0 });
			})
			.on('end', () => resolve(cities))
			.on('error', (err: Error) => reject(err));
	});

	private searchInGlobalIndex (query: string, limit: number) {
		const ids = this.globalIndex.search(query, { limit }) as number[];
		return ids.map(id => ({ name: this.idToCity.get(id)!.name, country: this.idToCity.get(id)!.country }));
	}

	private searchInCountryIndexes (countries: string[], query: string, limit: number) {
		const resultsByCountry: City[][] = [];

		for (const country of countries) {
			if (!this.countryToIndex.has(country)) {
				continue;
			}

			const index = this.countryToIndex.get(country)!;
			const ids = index.search(query, { limit }) as number[];
			resultsByCountry.push(ids.map(id => ({ name: this.idToCity.get(id)!.name, country: this.idToCity.get(id)!.country })));
		}

		const cities = _(resultsByCountry).unzip().flatten().filter(Boolean).take(limit).value();
		return cities;
	}

	private moveMatchesAtTheBeginningToTheTop (results: City[], query: string) {
		results.sort((a, b) => {
			if (a.name.toLowerCase().startsWith(query) && !b.name.toLowerCase().startsWith(query)) {
				return -1;
			}

			if (!a.name.toLowerCase().startsWith(query) && b.name.toLowerCase().startsWith(query)) {
				return 1;
			}

			return 0;
		});
	}
}

let citiesIndex: CitiesIndex | null = null;

export const getCitiesIndex = (context: EndpointExtensionContext) => {
	if (!citiesIndex) {
		citiesIndex = new CitiesIndex(context);
	}

	return citiesIndex;
};
