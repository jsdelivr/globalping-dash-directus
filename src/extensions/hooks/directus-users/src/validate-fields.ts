import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { getDirectusUsers } from './repositories/directus.js';

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

export const validateDefaultPrefix = async (defaultPrefix: string, keys: string[], accountability: EventContext['accountability'], context: HookExtensionContext) => {
	const user = (await getDirectusUsers(keys, accountability, context))[0];

	if (!user || !user.github_username || !user.github_organizations) {
		throw payloadError('User does not have required github data.');
	}

	const prefixesSchema = Joi.string().valid(user.github_username, ...user.github_organizations);

	const { error } = prefixesSchema.validate(defaultPrefix);

	if (error) {
		throw payloadError(error.message);
	}
};
