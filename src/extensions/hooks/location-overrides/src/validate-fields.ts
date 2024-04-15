import type { HookExtensionContext } from '@directus/extensions';
import { createError } from '@directus/errors';
import axios from 'axios';
import ipaddr from 'ipaddr.js';
import type { Fields } from './index.js';
import { normalizeCityName } from './normalize-city.js';

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
	population: number,
	fclName: string;
	adminCodes1: {
			ISO3166_2: string;
	},
	countryName: string;
	fcodeName: string;
	adminName1: string;
};

const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export const validateLocation = async (fields: Fields, context: HookExtensionContext) => {
	const { env } = context;

	const response = await axios<{totalResultsCount: number, geonames: City[]}>('http://api.geonames.org/searchJSON', {
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
		throw payloadError('No valid cities found. Please check "city" and "country" values. Validation algorithm can be checked here: https://www.geonames.org/advanced-search.html?featureClass=P');
	}

	const city = cities[0]!;

	fields.city = normalizeCityName(city.toponymName);
	fields.state = city.countryCode === 'US' ? city.adminCode1 : null;
	fields.country = city.countryCode;
	fields.latitude = city.lat;
	fields.longitude = city.lng;
};

export const validateIpRange = (ipRange: string) => {
	try {
		ipaddr.parseCIDR(ipRange);
	} catch (err) {
		throw payloadError((err as Error).message);
	}
};

