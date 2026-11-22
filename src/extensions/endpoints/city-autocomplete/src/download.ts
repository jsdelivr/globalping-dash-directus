import { downloadCities, generateCitiesJsonFile } from './download-cities.js';

const { GEONAMES_ETAG } = process.env;
downloadCities(GEONAMES_ETAG?.startsWith('"') ? GEONAMES_ETAG : undefined)
	.then(generateCitiesJsonFile)
	.then(() => { console.log('Cities JSON file generated.'); })
	.catch((err) => { throw err; });
