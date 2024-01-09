import TTLCache from '@isaacs/ttlcache';

export type City = {
	lng: string;
	geonameId: number;
	countryCode: string;
	name: string;
	toponymName: string;
	lat: string;
	fcl: string;
	fcode: string;
	adminCode1: string;
	countryId: string;
	population: number,
	fclName: string;
	adminCodes1: {
			ISO3166_2: string;
	},
	countryName: string;
	fcodeName: string;
	adminName1: string;
}

export const getKey = (keys: string[]) => keys.join(',');

export const geonamesCache = new TTLCache<string, City>({ ttl: 60 * 1000 });
