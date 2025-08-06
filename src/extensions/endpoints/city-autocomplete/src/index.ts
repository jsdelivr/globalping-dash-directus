import { createError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { getCitiesIndex } from './cities-index.js';

type Request = ExpressRequest & {
	accountability: {
		user: string;
		admin: boolean;
	};
	schema: object;
};

const cityAutocompleteSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	query: Joi.object({
		countries: Joi.string().required(), // A comma separated list of countries
		query: Joi.string().lowercase().required().allow(''),
		limit: Joi.number().default(5).max(10),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const citiesIndex = getCitiesIndex(context);
	citiesIndex.init().catch((err) => { throw err; });

	router.get('/', validate(cityAutocompleteSchema), asyncWrapper(async (req, res) => {
		const { value, error } = cityAutocompleteSchema.validate(req);

		if (error) {
			throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
		}

		if (!citiesIndex.isInitialized) {
			await citiesIndex.init();
		}

		const { query, countries, limit } = value.query as unknown as { query: string; countries: string; limit: number };
		const countriesArray = countries.split(',').map(country => country.trim()).filter(Boolean);
		const cities = citiesIndex.searchCities(countriesArray, query, limit);
		res.send(cities);
	}, context));
});
