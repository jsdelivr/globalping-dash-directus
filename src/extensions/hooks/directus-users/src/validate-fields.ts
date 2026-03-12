import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { configurableNotifications, configurableNotificationTypes } from '../../../lib/src/notification-types.js';
import { getDirectusUsers } from './repositories/directus.js';

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

const parameterSchema = Joi.number().strict().min(0).max(1_000_000_000);
const notificationTypesWithParameter = new Set(configurableNotificationTypes.filter(notificationType => configurableNotifications[notificationType]!.hasParameter));

const createNotificationPreferenceSchema = (notificationType: string) => Joi.object({
	enabled: Joi.boolean().required(),
	emailEnabled: Joi.boolean().optional(),
	parameter: notificationTypesWithParameter.has(notificationType)
		? Joi.when('enabled', {
			is: true,
			then: parameterSchema.required().messages({
				'any.required': 'Threshold value for notification should be specified.',
			}),
			otherwise: Joi.optional(),
		})
		: parameterSchema.optional(),
});

const userSchema = Joi.object({
	notification_preferences: Joi.object(Object.fromEntries(configurableNotificationTypes.map(notificationType => [ notificationType, createNotificationPreferenceSchema(notificationType) ]))).max(50).allow(null).optional(),
}).unknown(true);

export const joiValidateUser = (fields: unknown) => {
	const { error } = userSchema.validate(fields);

	if (error) {
		throw payloadError(error.message);
	}
};

export const validateDefaultPrefix = async (defaultPrefix: string, keys: string[], accountability: EventContext['accountability'] | null, context: HookExtensionContext) => {
	if (!accountability || !accountability.user) {
		return;
	}

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
