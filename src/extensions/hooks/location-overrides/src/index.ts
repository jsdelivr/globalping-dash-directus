import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { validateLocation, validateIpRange } from './validate-fields.js';

export type LocationOverride = {
	ip_range: string;
	city: string;
	state: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
};

export type Fields = Partial<LocationOverride>;

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export default defineHook(({ filter }, context) => {
	filter('gp_location_overrides.items.create', async (payload) => {
		const fields = payload as LocationOverride;

		validateIpRange(fields.ip_range);
		await validateLocation(fields, context);
	});

	filter('gp_location_overrides.items.update', async (payload) => {
		const fields = payload as Fields;
		// @ts-expect-error TODO: find why this errors.
		const optionalFields = _.remove(Object.keys(fields), field => field === 'ip_range' || field === 'city');

		if (fields.ip_range) {
			validateIpRange(fields.ip_range);
		}

		if (fields.city) {
			await validateLocation(fields, context);
		} else if (optionalFields) {
			throw payloadError('"city" value should be specified in payload.');
		}
	});
});
