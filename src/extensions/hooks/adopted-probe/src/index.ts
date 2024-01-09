import { defineHook } from '@directus/extensions-sdk';
import { createError } from '@directus/errors';
import { validateCity, validateTags } from './validate-fields.js';
import { resetMetadata, updateMetadata } from './update-metadata.js';

export type AdoptedProbe = {
	city: string | null;
	state: string | null;
	latitude: string | null;
	longitude: string | null;
	country: string | null;
	isCustomCity: boolean;
	tags: {value: string; prefix: string}[] | null;
	userId: string | null;
};

export type Fields = Partial<AdoptedProbe>;

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export default defineHook(({ filter, action }, context) => {
	filter('adopted_probes.items.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (!accountability) {
			throw new UserNotFoundError();
		}

		if (fields.tags && fields.tags.length > 0) {
			await validateTags(fields, keys, accountability, context);
		}

		if (fields.city || fields.city === '') {
			await validateCity(fields, keys, accountability, context);
		}
	});

	// State, latitude and longitude are updated in a separate hook, because user operation doesn't have permission to edit them.
	action('adopted_probes.items.update', async ({ keys, payload }) => {
		const fields = payload as Fields;

		if (fields.city) {
			await updateMetadata(fields, keys, context);
		} else if (fields.city === null) {
			await resetMetadata(fields, keys, context);
		}
	});
});
