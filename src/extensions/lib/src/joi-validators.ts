import type { CustomHelpers, ErrorReport } from 'joi';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

export const allowOnlyForCurrentUserAndAdmin = (mode: 'body' | 'query') => (value: Request, helpers: CustomHelpers): Request | ErrorReport => {
	// The account form carries its own ownership check, done where the account is validated.
	// PHASE4: remove the whole validator - `userId` is gone from every endpoint by then.
	if (value[mode].userId === undefined) {
		return value;
	}

	if (value.accountability.admin !== true && value[mode].userId === 'all') {
		return helpers.message({ custom: 'Allowed only for admin.' });
	}

	if (value.accountability.admin !== true && value.accountability.user !== value[mode].userId) {
		return helpers.message({ custom: 'Allowed only for the current user or admin.' });
	}

	return value;
};
