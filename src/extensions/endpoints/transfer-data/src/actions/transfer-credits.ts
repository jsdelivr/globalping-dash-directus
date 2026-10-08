import { createError } from '@directus/errors';
import type { Knex } from 'knex';
import type { Transfer } from '../types.js';

const NoCreditsError = createError('INVALID_PAYLOAD_ERROR', 'You have no credits to transfer.', 400);

export const transferCredits = async ({ userAccountId, orgAccountId, userGithubId, orgGithubId }: Transfer, trx: Knex.Transaction) => {
	const credits = await trx('gp_credits').where({ account_id: userAccountId }).first<{ amount: number } | undefined>('amount');

	if (credits?.amount) {
		await trx.raw(`
			INSERT INTO gp_credits (account_id, amount) VALUES (:account, :amount)
			ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)
		`, { account: orgAccountId, amount: credits.amount });
	}

	// A deduction in `gp_credits.amount` is recorded in `gp_credits_deductions` which is wrong, so the row is removed rather than set to zero.
	await trx('gp_credits').where({ account_id: userAccountId }).delete();

	// Deduction are moved to the org account, deductions in the same day are summed.
	await trx.raw(`
		INSERT INTO gp_credits_deductions (account_id, date, amount)
		SELECT :org, d.date, d.amount FROM (SELECT date, amount FROM gp_credits_deductions WHERE account_id = :user) d
		ON DUPLICATE KEY UPDATE amount = gp_credits_deductions.amount + VALUES(amount)
	`, { org: orgAccountId, user: userAccountId });

	const deductions = await trx('gp_credits_deductions').where({ account_id: userAccountId }).delete();

	const [{ affectedRows: additions }] = (await trx.raw(`
		UPDATE gp_credits_additions FORCE INDEX (github_id_and_date_created_index)
		SET github_id = :org WHERE github_id = :user
	`, { org: orgGithubId, user: userGithubId })) as [{ affectedRows: number }];

	const amount = credits?.amount ?? 0;

	if (!amount && !deductions && !additions) {
		throw new NoCreditsError();
	}

	return { credits: amount };
};
