import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { updateProbeWithRootPermissions, updateProbeWithUserPermissions } from './repositories/directus.js';
import { resetCustomLocation, patchCustomLocationRootFields, resetProbeName, resetUserDefinedData } from './update-with-root.js';
import { patchCustomLocationAllowedFields, validateTags, type City } from './update-with-user.js';

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

		const isResettingLocation = Object.hasOwn(fields, 'city') && !fields.city;
		const isUpdatingLocation = Boolean(fields.city || Object.hasOwn(fields, 'country') || Object.hasOwn(fields, 'state')) && !isResettingLocation;

		const [ newLocation ] = await Promise.all([
			isUpdatingLocation && patchCustomLocationAllowedFields(fields, keys, accountability, context),
			(fields.tags && fields.tags.length > 0) && validateTags(fields, keys, accountability, context),
			(Object.hasOwn(fields, 'name') && !fields.name) && resetProbeName(fields, keys, accountability, context),
		]);
		// updateProbeWithUserPermissions should go before updateProbeWithRootPermissions as it checks user permissions.
		// `userId` can't be set to null here, as this will break the further Directus item update with no permissions.
		await updateProbeWithUserPermissions(_.omit(fields, 'userId'), keys, accountability, context);

		const rootFields: Partial<Probe> = {};
		isUpdatingLocation && patchCustomLocationRootFields(rootFields, newLocation as City);
		isResettingLocation && resetCustomLocation(rootFields);
		// updateProbeWithRootPermissions should go after updateProbeWithUserPermissions as it updates all fields.
		await updateProbeWithRootPermissions(rootFields, keys, context);
	});

	action('gp_probes.items.update', async ({ keys, payload }) => {
		const fields = payload as Fields;
		console.log('action fields', fields);

		// In case of removing adoption, reset all user affected fields.
		if (fields.userId === null) {
			await resetUserDefinedData(fields, keys, context);
		}
	});
});
