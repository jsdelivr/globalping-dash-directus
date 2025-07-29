import { createError, isDirectusError } from '@directus/errors';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { Request as ExpressRequest } from 'express';
import Joi from 'joi';
import { CitiesIndex } from './repositories/cities-index.js';

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
		countries: Joi.string().default(''),
		query: Joi.string().required(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context) => {
	const { logger } = context;
	const citiesIndex = new CitiesIndex(context);
	citiesIndex.init().catch((err) => { throw err; });

	router.get('/', async (req, res) => {
		try {
			const { value, error } = cityAutocompleteSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			if (!citiesIndex.isInitialized) {
				await citiesIndex.init();
			}

			const { query, countries } = value.query as { query: string; countries: string };
			const countriesArray = countries.split(',').filter(Boolean);
			const cities = citiesIndex.searchCities(countriesArray, query);
			res.send(cities);
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});
});
