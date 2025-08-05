import { downloadCities, generateCitiesJsonFile } from './download-cities.js';

downloadCities()
	.then(generateCitiesJsonFile)
	.then(() => { console.log('Cities JSON file generated.'); })
	.catch((err) => { throw err; });
