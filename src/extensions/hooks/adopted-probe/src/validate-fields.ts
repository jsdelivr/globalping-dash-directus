import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import axios from 'axios';
import Joi from 'joi';
import { normalizeCityName } from '../../../lib/src/normalize-city.js';
import { type City, geonamesCache, getKey } from './geonames-cache.js';
import { getProbes, getUser } from './repositories/directus.js';
import type { Fields } from './index.js';

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
	})).max(5);

	const { error } = tagsSchema.validate(newTags);

	if (error) {
		throw payloadError(error.message);
	}
};

export const validateCustomLocation = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext) => {
	const { env } = context;

	if (keys.length > 1) {
		throw payloadError('Batch probe update is not supported.');
	}

	const [ probe ] = await getProbes(keys, context, accountability);

	if (!probe) {
		throw payloadError('Adopted probe not found.');
	}

	if (!probe.country || !probe.city || !probe.possibleCountries.length) {
		throw payloadError('Required data missing. Wait for the probe data to be synced with globalping.');
	}

	if (fields.country && !probe.possibleCountries.includes(fields.country)) {
		throw payloadError('Invalid country value.');
	}

	const url = `http://api.geonames.org/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=${env.GEONAMES_USERNAME}&country=${fields.country || probe.country}&q=${fields.city || probe.city}`;
	const response = await axios<{totalResultsCount: number, geonames: City[]}>(url, {
		timeout: 5000,
	});

	const cities = response.data.geonames;

	if (cities.length === 0) {
		throw payloadError('No valid cities found. Please check "city" and "country" values. Search algorithm can be checked here: https://www.geonames.org/advanced-search.html?featureClass=P');
	}

	const city = cities[0]!;
	geonamesCache.set(getKey(keys), city);

	fields.city = normalizeCityName(city.toponymName);
};
