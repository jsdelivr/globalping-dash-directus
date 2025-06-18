import type { CustomHelpers, ErrorReport } from 'joi';
import type { EventContext } from '@directus/types';
import type { Request as ExpressRequest } from 'express';

type Request = ExpressRequest & {
	accountability: NonNullable<EventContext['accountability']>;
};

export const allowOnlyForCurrentUserAndAdmin = (mode: 'body' | 'query') => (value: Request, helpers: CustomHelpers): Request | ErrorReport => {
	if (value.accountability.admin !== true && value[mode].userId === 'all') {
		return helpers.message({ custom: 'Allowed only for admin.' });
	}

	if (value.accountability.admin !== true && value.accountability.user !== value[mode].userId) {
		return helpers.message({ custom: 'Allowed only for the current user or admin.' });
	}

	return value;
};
