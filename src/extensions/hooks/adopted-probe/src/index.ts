import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import { resetCustomLocation, resetUserDefinedData, updateCustomLocationData, updateProbeName } from './update-metadata.js';
import { validateCustomLocation, validateTags } from './validate-fields.js';

export type Probe = {
	name: string | null;
	city: string | null;
	state: string | null;
	latitude: string | null;
	longitude: string | null;
	country: string | null;
	customLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	tags: { value: string; prefix: string }[] | null;
	userId: string | null;
	allowedCountries: string[];
};

export type Fields = Partial<Probe>;

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export default defineHook(({ filter, action }, context) => {
	filter('gp_probes.items.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (!accountability || !accountability.user) {
			throw new UserNotFoundError();
		}

		await Promise.all([
			(fields.tags && fields.tags.length > 0) && validateTags(fields, keys, accountability, context),
			(fields.city || fields.country) && validateCustomLocation(fields, keys, accountability, context),
			(Object.hasOwn(fields, 'name') && !fields.name) && updateProbeName(fields, keys, accountability, context),
		]);
	});

	// State, latitude, longitude, customLocation are updated in action hook, because user operation doesn't have permissions to edit them.
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
