import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import axios from 'axios';
import Joi from 'joi';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';
import { getProbes, getUser } from './repositories/directus.js';
import type { Fields } from './index.js';

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
	population: number;
	fclName: string;
	adminCodes1: {
		ISO3166_2: string;
	};
	countryName: string;
	fcodeName: string;
	adminName1: string;
};

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export const validateTags = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext) => {
	if (!fields.tags) {
		return;
	}

	const currentProbes = await getProbes(keys, context);

	if (!currentProbes || currentProbes.length === 0) {
		throw payloadError('Adopted probes not found.');
	}

	const userId = currentProbes[0]?.userId;

	if (!userId) {
		throw payloadError('User id not found.');
	}

	if (currentProbes.some(probe => probe.userId !== userId)) {
		throw payloadError('User id is not the same for the requested probes.');
	}

	const existingTagsArrays = currentProbes.map(probe => probe.tags || []);

	const user = await getUser(userId, accountability, context);

	if (!user || !user.github_username) {
		throw payloadError('User does not have required github data.');
	}

	const newTags = fields.tags.filter(tag => existingTagsArrays
		.some(existingTags => existingTags.findIndex(existingTag => tag.prefix === existingTag.prefix && tag.value === existingTag.value) === -1));

	const validPrefixes = [ user.github_username, ...user.github_organizations ];

	const tagsSchema = Joi.array().items(Joi.object({
		value: Joi.string().trim().pattern(/^[a-zA-Z0-9-]+$/).max(32).required(),
		prefix: Joi.string().valid(...validPrefixes).required(),
	}));

	if (fields.tags.length > 5) {
		throw payloadError('A maximum of 5 tags is allowed.');
	}

	const { error } = tagsSchema.validate(newTags);

	if (error) {
		throw payloadError(error.message);
	}
};

export const patchCustomLocationAllowedFields = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext): Promise<City> => {
	const { env } = context;

	if (keys.length > 1) {
		throw payloadError('Batch probe location update is not supported.');
	}

	if (Object.hasOwn(fields, 'country') && !fields.country) {
		throw payloadError(`Country value can't be falsy.`);
	}

	if (Object.hasOwn(fields, 'state') && !fields.state) {
		throw payloadError(`State value can't be falsy.`);
	}

	const [ probe ] = await getProbes(keys, context, accountability);

	if (!probe) {
		throw payloadError('Adopted probe not found.');
	}

	if (!probe.country || !probe.city || !probe.allowedCountries.length) {
		throw payloadError('Required data missing. Wait for the probe data to be synced with globalping.');
	}

	if (fields.country && !probe.allowedCountries.includes(fields.country)) {
		throw payloadError('Invalid country value.');
	}

	const country = fields.country || probe.country;

	if (fields.state && country !== 'US') {
		throw payloadError('State changing is only allowed for US probes.');
	}

	const response = await axios<{ totalResultsCount: number; geonames: City[] }>('http://api.geonames.org/searchJSON', {
		params: {
			featureClass: 'P',
			style: 'medium',
			isNameRequired: 'true',
			maxRows: '1',
			username: env.GEONAMES_USERNAME,
			country,
			name: fields.city || probe.city,
			adminCode1: fields.state,
		},
		timeout: 5000,
	});

	const cities = response.data.geonames;

	if (cities.length === 0) {
		throw payloadError('No matching cities found. Please check the "city" and "country" values, and try using the English version of the name.');
	}

	const city = cities[0]!;
	city.toponymName = normalizeCityName(city.toponymName);

	fields.city = city.toponymName;
	fields.country = city.countryCode;
	fields.state = city.countryCode === 'US' ? city.adminCode1 : null;

	return city;
};
