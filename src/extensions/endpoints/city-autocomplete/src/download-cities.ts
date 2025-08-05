import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'stream';
import AdmZip from 'adm-zip';
import axios from 'axios';
import csvParser from 'csv-parser';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';

const URL = 'https://download.geonames.org/export/dump/cities500.zip';

export const FILENAME = 'GEONAMES_CITIES.json';

export type City = {
	name: string;
	country: string;
	state?: string;
	population: number;
	searchValue: string;
};

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

const query = async (url: string): Promise<Buffer> => {
	const result = await axios.get(url, {
		responseType: 'arraybuffer',
		timeout: 5000,
	});

	return result.data;
};

export const downloadCities = async (): Promise<City[]> => {
	const response = await query(URL);
	const zip = new AdmZip(response);
	const buffer = zip.readFile('cities500.txt');
	const stream = Readable.from([ buffer ]);

	return new Promise<City[]>((resolve, reject) => {
		const cities: City[] = [];

		stream
			.pipe(csvParser({
				headers: [ 'geonameId', 'name', 'asciiName', 'alternateNames', 'latitude', 'longitude', 'featureClass', 'featureCode', 'countryCode', 'cc2', 'admin1Code', 'admin2Code', 'admin3Code', 'admin4Code', 'population', 'elevation', 'dem', 'timezone', 'modificationDate' ],
				separator: '\t',
			}))
			.on('data', (city: CityCsvRow) => {
				if (city.featureCode !== 'PPLX') {
					const name = normalizeCityName(city.name);
					cities.push({
						name,
						country: city.countryCode,
						population: parseInt(city.population, 10) || 0,
						...city.countryCode === 'US' ? { state: city.admin1Code } : {},
						searchValue: name.toLowerCase(),
					});
				}
			})
			.on('end', () => resolve(cities))
			.on('error', (err: Error) => reject(err));
	});
};

export const generateCitiesJsonFile = async (cities: City[]): Promise<void> => {
	const citiesOfCountries: Record<string, City[]> = {};
	cities.sort((a, b) => b.population - a.population);

	for (const city of cities) {
		if (!citiesOfCountries[city.country]) {
			citiesOfCountries[city.country] = [];
		}

		citiesOfCountries[city.country]!.push(city);
	}

	const __dirname = dirname(fileURLToPath(import.meta.url));
	const dirPath = path.resolve(__dirname, '../data');
	const filePath = path.resolve(dirPath, FILENAME);
	await fs.promises.mkdir(dirPath, { recursive: true });
	await fs.promises.writeFile(filePath, JSON.stringify(citiesOfCountries, null, 2));
};
