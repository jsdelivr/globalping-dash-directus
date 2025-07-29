import AdmZip from 'adm-zip';
import got from 'got';

const URL = 'https://download.geonames.org/export/dump/cities500.zip';

export const FILENAME = 'GEONAMES_CITIES.csv';

const query = async (url: string): Promise<Buffer> => {
	const result = await got(url, {
		responseType: 'buffer',
		timeout: { request: 5000 },
	});

	return result.body;
};

export const downloadCitiesFile = async (): Promise<void> => {
	const response = await query(URL);
	const zip = new AdmZip(response);
	zip.extractEntryTo('cities500.txt', 'data', true, true, false, FILENAME);
};
