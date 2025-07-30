import AdmZip from 'adm-zip';
import axios from 'axios';

const URL = 'https://download.geonames.org/export/dump/cities500.zip';

export const FILENAME = 'GEONAMES_CITIES.csv';

const query = async (url: string): Promise<Buffer> => {
	const result = await axios.get(url, {
		responseType: 'arraybuffer',
		timeout: 5000,
	});

	return result.data;
};

export const downloadCitiesFile = async (): Promise<void> => {
	const response = await query(URL);
	const zip = new AdmZip(response);
	zip.extractEntryTo('cities500.txt', 'data', true, true, false, FILENAME);
};
