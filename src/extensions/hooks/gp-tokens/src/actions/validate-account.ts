import { createError } from '@directus/errors';
import type { EventContext } from '@directus/types';
import { isAccountAvailable } from '../../../../lib/src/accounts.js';
import type { Token } from '../index.js';

const ForbiddenAccountError = createError('INVALID_PAYLOAD_ERROR', 'You can not create a token for this account.', 400);
const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export const validateAccount = async (token: Partial<Token>, context: EventContext) => {
	const { accountability, database } = context;

	if (accountability?.admin) {
		return;
	}

	// PHASE5: it should always be present.
	if (!token.account_id) {
		return;
	}

	if (!accountability?.user) {
		throw new UserNotFoundError();
	}

	// Only admins and members of the org can create tokens for it.
	if (!await isAccountAvailable(token.account_id, accountability.user, database, [ 'admin', 'member' ])) {
		throw new ForbiddenAccountError();
	}
};
