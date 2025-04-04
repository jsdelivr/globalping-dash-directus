import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { resetCustomLocation, resetUserDefinedData, updateCustomLocationData } from './update-metadata.js';
import { validateCustomLocation, validateTags } from './validate-fields.js';

export type Probe = {
	name: string | null;
	city: string | null;
	state: string | null;
	latitude: string | null;
	longitude: string | null;
	country: string | null;
	countryOfCustomCity: string | null;
	isCustomCity: boolean;
	tags: {value: string; prefix: string}[] | null;
	userId: string | null;
	possibleCountries: string[];
};

export type Fields = Partial<Probe>;

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export default defineHook(({ filter, action }, context) => {
	filter('gp_probes.items.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (!accountability || !accountability.user) {
			throw new UserNotFoundError();
		}

		if (fields.tags && fields.tags.length > 0) {
			await validateTags(fields, keys, accountability, context);
		}

		if (fields.city || fields.country) {
			await validateCustomLocation(fields, keys, accountability, context);
		}
	});

	// State, latitude and longitude are updated in action hook, because user operation doesn't have permissions to edit them.
	action('gp_probes.items.update', async ({ keys, payload }) => {
		const fields = payload as Fields;

		if (fields.city) {
			await updateCustomLocationData(fields, keys, context);
		} else if (!fields.city && fields.city !== undefined) {
			await resetCustomLocation(fields, keys, context);
		}

		// In case of removing adoption, reset all user affected fields.
		if (fields.userId === null) {
			await resetUserDefinedData(fields, keys, context);
		}
	});
});
