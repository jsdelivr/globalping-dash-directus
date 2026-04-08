import { createError } from '@directus/errors';
import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { configurableNotificationTypes, getNotificationType } from '../../../lib/src/notification-types.js';
import { getDirectusUsers } from './repositories/directus.js';

export const payloadError = (message: string) => new (createError('INVALID_PAYLOAD_ERROR', message, 400))();

const parameterSchema = Joi.number().strict().min(0).max(1_000_000_000);

const validateNotificationParameter = (value: { enabled: boolean; parameter?: number }, helpers: Joi.CustomHelpers) => {
	const pathSegments = helpers.state.path ?? [];
	const notificationType = pathSegments[pathSegments.length - 1] as string;
	const notification = getNotificationType(notificationType);

	if (notification?.hasParameter && value.enabled && typeof value.parameter !== 'number') {
		return { ...value, parameter: notification.defaultParameter };
	}

	return value;
};

const validateReadOnly = (value: { enabled: boolean; parameter?: number }, helpers: Joi.CustomHelpers) => {
	const pathSegments = helpers.state.path ?? [];
	const notificationType = pathSegments[pathSegments.length - 1] as string;
	const notification = getNotificationType(notificationType);

	if (notification?.readOnly) {
		return { ...value, enabled: true };
	}

	return value;
};

const userSchema = Joi.object({
	notification_preferences: Joi.object().pattern(
		Joi.string().max(100).valid(...configurableNotificationTypes),
		Joi.object({
			enabled: Joi.boolean().required(),
			emailEnabled: Joi.boolean().optional(),
			parameter: parameterSchema.optional(),
		}).custom(validateNotificationParameter).custom(validateReadOnly),
	).max(50).allow(null).optional(),
}).unknown(true);

export const joiValidateUser = (fields: Record<string, unknown>) => {
	const { error, value } = userSchema.validate(fields);

	if (error) {
		throw payloadError(error.message);
	}

	Object.assign(fields, value);
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
