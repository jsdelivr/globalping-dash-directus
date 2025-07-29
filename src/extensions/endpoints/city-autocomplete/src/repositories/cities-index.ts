import fs from 'node:fs';
import type { EndpointExtensionContext } from '@directus/extensions';
import csvParser from 'csv-parser';
import { Index, Charset } from 'flexsearch';
import { FILENAME } from '../actions/download-cities.js';

type CityRow = {
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

type City = {
	geonameId: string;
	name: string;
	country: string;
	population: number;
};

export class CitiesIndex {
	public isInitialized = false;
	private initializePromise: Promise<void> | null = null;
	private countryToIndex = new Map<string, Index>();
	private idToCityName = new Map<number, string>();

	constructor (private readonly context: EndpointExtensionContext) {}

	async init () {
		if (this.initializePromise) {
			return this.initializePromise;
		}

		this.initializePromise = this.initCitiesIndex();
		return this.initializePromise;
	}

	private async initCitiesIndex () {
		const { logger } = this.context;
		const cities = await this.readCitiesCsvFile();
		cities.sort((a, b) => b.population - a.population);

		logger.info('Building cities index...');

		for (const city of cities) {
			const id = parseInt(city.geonameId, 10);
			this.idToCityName.set(id, city.name);

			if (!this.countryToIndex.has(city.country)) {
				this.countryToIndex.set(city.country, new Index({
					tokenize: 'full',
					encoder: Charset.LatinExtra,
					cache: true,
				}));
			}

			this.countryToIndex.get(city.country)!.add(id, city.name);
		}

		this.isInitialized = true;

		logger.info('Cities index build successfully.');
	}

	private readCitiesCsvFile = () => new Promise<City[]>((resolve, reject) => {
		const cities: City[] = [];
		fs.createReadStream(`data/${FILENAME}`)
			.pipe(csvParser({
				headers: [ 'geonameId', 'name', 'asciiName', 'alternateNames', 'latitude', 'longitude', 'featureClass', 'featureCode', 'countryCode', 'cc2', 'admin1Code', 'admin2Code', 'admin3Code', 'admin4Code', 'population', 'elevation', 'dem', 'timezone', 'modificationDate' ],
				separator: '\t',
			}))
			.on('data', (city: CityRow) => {
				cities.push({ geonameId: city.geonameId, name: city.name, country: city.countryCode, population: parseInt(city.population, 10) || 0 });
			})
			.on('end', () => {
				resolve(cities);
			})
			.on('error', (err: Error) => reject(err));
	});

	searchCities (countries: string[], query: string) {
		const results: { name: string; country: string }[] = [];

		for (const country of countries) {
			if (!this.countryToIndex.has(country)) {
				continue;
			}

			const index = this.countryToIndex.get(country)!;
			const ids = index.search(query, { limit: 10 }) as number[];
			results.push(...ids.map(id => ({ name: this.idToCityName.get(id)!, country })));
		}

		return results;
	}
}
