import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import axios from 'axios';
// eslint-disable-next-line n/no-missing-import
import ipaddr from 'ipaddr.js';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';
import type { Fields } from './index.js';

type City = {
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
	population: number;
	fclName: string;
	adminCodes1: {
		ISO3166_2: string;
	};
	countryName: string;
	fcodeName: string;
	adminName1: string;
};

const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export const validateLocation = async (fields: Fields, context: HookExtensionContext) => {
	const { env } = context;

	const response = await axios<{ totalResultsCount: number; geonames: City[] }>('http://api.geonames.org/searchJSON', {
		params: {
			featureClass: 'P',
			style: 'medium',
			isNameRequired: true,
			maxRows: 1,
			username: env.GEONAMES_USERNAME,
			country: fields.country,
			q: fields.city,
		},
		timeout: 5000,
	});

	const cities = response.data.geonames;

	if (cities.length === 0) {
		throw payloadError('No matching cities found. Please check the "city" and "country" values, and try using the English version of the name.');
	}

	const city = cities[0]!;

	fields.city = normalizeCityName(city.toponymName);
	fields.state = city.countryCode === 'US' ? city.adminCode1 : null;
	fields.country = city.countryCode;
	fields.latitude = Math.round(Number(city.lat) * 100) / 100;
	fields.longitude = Math.round(Number(city.lng) * 100) / 100;
};

export const validateIpRange = (ipRange: string) => {
	try {
		ipaddr.parseCIDR(ipRange);
	} catch (err) {
		throw payloadError((err as Error).message);
	}
};

