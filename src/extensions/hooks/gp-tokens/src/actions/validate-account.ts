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

	const account = await database('gp_accounts as a')
		.leftJoin('gp_org_members as m', function () {
			this.on('m.org', 'a.org').andOnVal('m.user', '=', accountability?.user ?? null);
		})
		.where('a.id', token.account_id)
		.where((query) => {
			query.where('a.user', accountability?.user ?? null).orWhereIn('m.role', [ 'admin', 'member' ]);
		})
		.first('a.id');

	if (!account) {
		throw new ForbiddenAccountError();
	}
};
