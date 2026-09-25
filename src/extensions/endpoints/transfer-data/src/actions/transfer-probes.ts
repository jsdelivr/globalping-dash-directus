import { createError } from '@directus/errors';
import type { Knex } from 'knex';
import { generateBytes } from '../../../../lib/src/bytes.js';
import type { Transfer } from '../types.js';

const NoGithubUsernameError = createError('INVALID_PAYLOAD_ERROR', 'A GitHub username is required to hand the probes over.', 400);

// The probes keep reporting the user's adoption token, so the token moves with them and the user gets a fresh one.
const handOverAdoptionToken = async ({ userId, orgId }: Transfer, trx: Knex.Transaction) => {
	const user = await trx('directus_users')
		.where({ id: userId })
		.first<{ adoption_token: string | null; github_username: string | null }>('adoption_token', 'github_username');

	if (!user.adoption_token) {
		return;
	}

	if (!user.github_username) {
		throw new NoGithubUsernameError();
	}

	await trx.raw(`
		UPDATE gp_orgs
		SET extra_adoption_tokens = JSON_ARRAY_APPEND(extra_adoption_tokens, '$', JSON_OBJECT('github_username', :username, 'token', :token))
		WHERE id = :org
	`, { username: user.github_username, token: user.adoption_token, org: orgId });

	await trx('directus_users').where({ id: userId }).update({ adoption_token: await generateBytes() });
};

export const transferProbes = async (transfer: Transfer, trx: Knex.Transaction) => {
	const moved = await trx('gp_probes').where({ account_id: transfer.userAccountId }).update({ account_id: transfer.orgAccountId });

	if (moved) {
		await handOverAdoptionToken(transfer, trx);
	}
};
