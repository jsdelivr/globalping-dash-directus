import { createError } from '@directus/errors';
import type { EventContext } from '@directus/types';
import type { Token } from '../index.js';

const ForbiddenAccountError = createError('INVALID_PAYLOAD_ERROR', 'You can not create a token for this account.', 400);

export const validateAccount = async (token: Partial<Token>, context: EventContext) => {
	const { accountability, database } = context;

	if (accountability?.admin) {
		return;
	}

	// PHASE4: it should always be present.
	if (!token.account_id) {
		return;
	}

	// The account is available to its own user, and to the admins and members (but not viewers) of its org.
	const [ rows ] = await database.raw(`
		SELECT a.id FROM gp_accounts a
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.user = :user AND m.role IN ('admin', 'member')
		WHERE a.id = :account AND (a.user = :user OR m.id IS NOT NULL)
	`, { user: accountability?.user ?? null, account: token.account_id });

	if (rows.length === 0) {
		throw new ForbiddenAccountError();
	}
};
