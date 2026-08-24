import { createError } from '@directus/errors';
import type { Knex } from 'knex';
import { filterOrgIdsByBeingAdmin } from '../../../../lib/src/accounts.js';
import { joiNotificationPreferences } from '../../../../lib/src/notification-types.js';
import type { Fields, Membership } from '../types.js';

const ForbiddenPreferencesError = createError('INVALID_PAYLOAD_ERROR', 'Notification preferences can only be changed on your own membership.', 400);
const ForbiddenRoleError = createError('INVALID_PAYLOAD_ERROR', 'Only an admin of the org can change roles.', 400);

export const validatePreferences = (fields: Fields, memberships: Membership[], userId: string) => {
	if (memberships.some(membership => membership.user !== userId)) {
		throw new ForbiddenPreferencesError();
	}

	const { error, value } = joiNotificationPreferences.validate(fields.notification_preferences);

	if (error) {
		throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
	}

	fields.notification_preferences = value;
};

export const validateRole = async (memberships: Membership[], userId: string, database: Knex) => {
	const orgIds = [ ...new Set(memberships.map(membership => membership.org)) ];
	const adminOrgIds = await filterOrgIdsByBeingAdmin(orgIds, userId, database);

	if (orgIds.some(orgId => !adminOrgIds.has(orgId))) {
		throw new ForbiddenRoleError();
	}
};
