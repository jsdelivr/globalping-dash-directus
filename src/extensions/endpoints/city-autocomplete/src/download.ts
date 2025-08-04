import { downloadCitiesFile } from './actions/download-cities.js';

downloadCitiesFile()
	.then(() => { console.log('Downloaded geonames cities file.'); })
	.catch((err) => { throw err; });
