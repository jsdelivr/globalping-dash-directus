import { createError } from '@directus/errors';
import type { Knex } from 'knex';
import type { Transfer } from '../types.js';

const NoTokensError = createError('INVALID_PAYLOAD_ERROR', 'You have no tokens or app approvals to transfer.', 400);

export const transferTokens = async ({ userId, userAccountId, orgAccountId }: Transfer, trx: Knex.Transaction) => {
	const [ [{ apps }] ] = (await trx.raw(`
		SELECT COUNT(DISTINCT app) AS apps FROM (
			SELECT app_id AS app FROM gp_tokens WHERE account_id = :account AND app_id IS NOT NULL
			UNION SELECT app FROM gp_apps_approvals WHERE user_created = :user AND account_id = :account
		) AS apps
	`, { user: userId, account: userAccountId })) as [[{ apps: number }]];

	const tokens = await trx('gp_tokens').where({ account_id: userAccountId }).whereNull('app_id').update({ account_id: orgAccountId });
	await trx('gp_tokens').where({ account_id: userAccountId }).update({ account_id: orgAccountId });

	// 1. Drop the personal approvals for apps this person has already approved for the org: they would collide on UNIQUE (user_created, app, account_id).
	await trx.raw(`
		DELETE FROM gp_apps_approvals
		WHERE user_created = :user AND account_id = :userAccount
		AND app IN (SELECT app FROM (SELECT app FROM gp_apps_approvals WHERE user_created = :user AND account_id = :org) approved)
	`, { user: userId, userAccount: userAccountId, org: orgAccountId });

	// 2. Move other approvals to the org.
	await trx('gp_apps_approvals')
		.where({ user_created: userId, account_id: userAccountId })
		.update({ account_id: orgAccountId });

	if (!tokens && !apps) {
		throw new NoTokensError();
	}

	return { tokens, apps };
};
