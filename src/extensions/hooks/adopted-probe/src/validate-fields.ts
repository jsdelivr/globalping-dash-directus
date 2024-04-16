import Joi from 'joi';
import type { HookExtensionContext } from '@directus/extensions';
import axios from 'axios';
import { createError } from '@directus/errors';
import { Fields } from './index.js';
import { City, geonamesCache, getKey } from './geonames-cache.js';
import { normalizeCityName } from '../../../lib/normalize-city.js';
import { EventContext } from '@directus/types';
import { getProbes, getUser } from './repositories/directus.js';

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
		throw payloadError('User does not have enough github data.');
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

export const validateCity = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext) => {
	const { env } = context;
	const currentProbes = await getProbes(keys, context, accountability);

	if (!currentProbes || currentProbes.length === 0) {
		throw payloadError('Adopted probes not found.');
	}

	const country = currentProbes[0]!.country;

	if (!country) {
		throw payloadError('Country is not defined. Wait for the probe data to be synced with globalping.');
	}

	const allInSameCountry = currentProbes.every(currentProbe => currentProbe.country === country);

	if (!allInSameCountry) {
		throw payloadError('Requested adopted probes are in different countries. Update the list of items you want to edit.');
	}

	const url = `http://api.geonames.org/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=${env.GEONAMES_USERNAME}&country=${country}&q=${fields.city}`;
	const response = await axios<{totalResultsCount: number, geonames: City[]}>(url, {
		timeout: 5000,
	});

	const cities = response.data.geonames;

	if (cities.length === 0) {
		throw payloadError('No valid cities found. Please check "city" and "country" values. Validation algorithm can be checked here: https://www.geonames.org/advanced-search.html?featureClass=P');
	}

	const city = cities[0]!;
	geonamesCache.set(getKey(keys), city);

	fields.city = normalizeCityName(city.toponymName);
};
