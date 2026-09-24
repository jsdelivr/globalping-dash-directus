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

	const org = await trx('gp_orgs').where({ id: orgId }).first<{ extra_adoption_tokens: string }>('extra_adoption_tokens');
	const tokens = JSON.parse(org.extra_adoption_tokens) as { github_username: string; token: string }[];

	tokens.push({ github_username: user.github_username, token: user.adoption_token });

	await trx('gp_orgs').where({ id: orgId }).update({ extra_adoption_tokens: JSON.stringify(tokens) });
	await trx('directus_users').where({ id: userId }).update({ adoption_token: await generateBytes() });
};

export const transferProbes = async (transfer: Transfer, trx: Knex.Transaction) => {
	const moved = await trx('gp_probes').where({ account_id: transfer.userAccountId }).update({ account_id: transfer.orgAccountId });

	if (moved) {
		await handOverAdoptionToken(transfer, trx);
	}
};
