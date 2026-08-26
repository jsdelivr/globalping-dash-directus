import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { joiNotificationPreferences } from '../../../lib/src/notification-types.js';
import { getDirectusUsers, getMembershipOrgIds } from './repositories/directus.js';

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

const userSchema = Joi.object({
	notification_preferences: joiNotificationPreferences.optional(),
	selected_orgs: Joi.array().items(Joi.string().uuid()).optional(),
}).unknown(true);

export const joiValidateUser = (fields: Record<string, unknown>) => {
	const { error, value } = userSchema.validate(fields);

	if (error) {
		throw payloadError(error.message);
	}

	Object.assign(fields, value);
};

// The list is what the dashboard switcher shows, so it may only hold orgs the user is actually a member of.
export const validateSelectedOrgs = async (selectedOrgs: string[], userIds: string[], context: HookExtensionContext) => {
	if (selectedOrgs.length === 0) {
		return;
	}

	if (userIds.length > 1) {
		throw payloadError('Batch selected orgs update is not supported.');
	}

	const orgIds = await getMembershipOrgIds(userIds[0]!, context);
	const foreign = selectedOrgs.filter(orgId => !orgIds.has(orgId));

	if (foreign.length > 0) {
		throw payloadError(`Not a member of the selected orgs: ${foreign.join(', ')}.`);
	}
};

export const validateDefaultPrefix = async (defaultPrefix: string, userIds: string[], accountability: EventContext['accountability'] | null, context: HookExtensionContext) => {
	if (!accountability || !accountability.user) {
		return;
	}

	const user = (await getDirectusUsers(userIds, accountability, context))[0];

	if (!user || !user.github_username || !user.github_organizations) {
		throw payloadError('User does not have required github data.');
	}

	const prefixesSchema = Joi.string().valid(user.github_username, ...user.github_organizations);

	const { error } = prefixesSchema.validate(defaultPrefix);

	if (error) {
		throw payloadError(error.message);
	}
};
