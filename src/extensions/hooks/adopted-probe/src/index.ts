import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';
import { getResetLocationFields } from '../../../lib/src/reset-fields.js';
import { updateProbeWithRootPermissions, updateProbeWithUserPermissions } from './repositories/directus.js';
import { patchCustomLocationRootFields, resetUserDefinedData } from './update-with-root.js';
import { patchCustomLocationAllowedFields, resetProbeName, resetCustomLocationAllowedFields, validateTags } from './update-with-user.js';

export type Probe = {
	id: string;
	name: string | null;
	city: string;
	state: string | null;
	stateName: string | null;
	latitude: string;
	longitude: string;
	country: string;
	countryName: string;
	continent: string;
	continentName: string;
	region: string;
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	customLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	tags: { value: string; prefix: string }[];
	userId: string | null;
	allowedCountries: string[];
};

export type Fields = Partial<Probe>;

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export default defineHook(({ filter, action }, context) => {
	filter('gp_probes.items.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (!accountability || !accountability.user) {
			throw new UserNotFoundError();
		}

		const isResettingLocation = Object.hasOwn(fields, 'city') && !fields.city;
		const isUpdatingLocation = Boolean(fields.city || Object.hasOwn(fields, 'country') || Object.hasOwn(fields, 'state')) && !isResettingLocation;

		const [{ newLocation, originalProbe }, { originalProbe: originalProbeFromReset }] = await Promise.all([
			isUpdatingLocation ? patchCustomLocationAllowedFields(fields, keys, accountability, context) : { newLocation: null, originalProbe: null },
			isResettingLocation ? resetCustomLocationAllowedFields(fields, keys, accountability, context) : { originalProbe: null },
			(fields.tags && fields.tags.length > 0) && validateTags(fields, keys, accountability, context),
			(Object.hasOwn(fields, 'name') && !fields.name) && resetProbeName(fields, keys, accountability, context),
		]);
		// `userId` can't be set to null here, as this will break the further Directus item update with no permissions.
		await updateProbeWithUserPermissions(_.omit(fields, 'userId'), keys, accountability, context);

		const rootFields: Partial<Probe> = {};
		isUpdatingLocation && patchCustomLocationRootFields(rootFields, keys, newLocation!, originalProbe!);
		isResettingLocation && _.assign(rootFields, getResetLocationFields(originalProbeFromReset!));
		// updateProbeWithRootPermissions should be called only after updateProbeWithUserPermissions is finished as it checks user permissions.
		await updateProbeWithRootPermissions(rootFields, keys, context);
	});

	action('gp_probes.items.update', async ({ keys, payload }) => {
		const fields = payload as Fields;

		// In case of removing adoption, reset all user affected fields.
		if (fields.userId === null) {
			await resetUserDefinedData(fields, keys, context);
		}
	});
});
