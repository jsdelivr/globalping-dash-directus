import type { HookExtensionContext } from '@directus/extensions';
import axios from 'axios';
import { createError } from '@directus/errors';
import { AdoptedProbe, Fields } from './index';
import { City, geonamesCache, getKey } from './geonames-cache';
import { normalizeCityName } from './normalize-city';
import { EventContext } from '@directus/types';

export const InvalidTagError = createError('INVALID_PAYLOAD_ERROR', 'Some of the tags have invalid symbols. Valid symbols are: EN letters, numbers and "-" signs', 400);
export const TooBigTagError = createError('INVALID_PAYLOAD_ERROR', 'Some of the tags are too big. Max length is 32 characters.', 400);
export const TooManyTagsError = createError('INVALID_PAYLOAD_ERROR', 'No more than 5 tags are allowed.', 400);
export const ProbesNotFoundError = createError('INVALID_PAYLOAD_ERROR', 'Adopted probes not found.', 400);
export const CountryNotDefinedError = createError('INVALID_PAYLOAD_ERROR', 'Country is not defined. Wait for the probe data to be synced with globalping.', 400);
export const DifferentCountriesError = createError('INVALID_PAYLOAD_ERROR', 'Requested adopted probes are in different countries. Update the list of items you want to edit.', 400);
export const InvalidCityError = createError('INVALID_PAYLOAD_ERROR', 'No valid cities found. Please check "city" and "country" values. Validation algorithm can be checked here: https://www.geonames.org/advanced-search.html?featureClass=P', 400);

export const validateTags = (fields: Fields) => {
	if (fields.tags!.length > 5) {
		throw new TooManyTagsError();
	}

	fields.tags = fields.tags!.map(tag => tag.trim());

	if (fields.tags!.some(tag => !/^[a-zA-Z0-9-]+$/.test(tag))) {
		throw new InvalidTagError();
	}

	if (fields.tags!.some(tag => tag.length > 32)) {
		throw new TooBigTagError();
	}
};

export const validateCity = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], { env, services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('adopted_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	const currentProbes = await adoptedProbesService.readMany(keys) as AdoptedProbe[];

	if (!currentProbes || currentProbes.length === 0) {
		throw new ProbesNotFoundError();
	}

	const country = currentProbes[0]!.country;

	if (!country) {
		throw new CountryNotDefinedError();
	}

	const allInSameCountry = currentProbes.every(currentProbe => currentProbe.country === country);

	if (!allInSameCountry) {
		throw new DifferentCountriesError();
	}

	const url = `http://api.geonames.org/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=${env.GEONAMES_USERNAME}&country=${country}&q=${fields.city}`;
	const response = await axios<{totalResultsCount: number, geonames: City[]}>(url, {
		timeout: 5000,
	});

	const cities = response.data.geonames;

	if (cities.length === 0) {
		throw new InvalidCityError();
	}

	const city = cities[0]!;
	geonamesCache.set(getKey(keys), city);

	fields.city = normalizeCityName(city.toponymName);
};
