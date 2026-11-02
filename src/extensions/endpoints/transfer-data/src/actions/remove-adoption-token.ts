import { createError } from '@directus/errors';
import type { Knex } from 'knex';

const TokenNotFoundError = createError('INVALID_PAYLOAD_ERROR', 'Adoption token not found.', 400);

export const removeAdoptionToken = async (accountId: string, token: string, trx: Knex.Transaction) => {
	const org = await trx('gp_orgs')
		.join('gp_accounts', 'gp_accounts.org', 'gp_orgs.id')
		.where({ 'gp_accounts.id': accountId })
		.forUpdate()
		.first<{ id: string; extra_adoption_tokens: string } | undefined>('gp_orgs.id', 'gp_orgs.extra_adoption_tokens');

	const tokens = JSON.parse(org?.extra_adoption_tokens ?? '[]') as { token: string }[];
	const kept = tokens.filter(entry => entry.token !== token);

	if (!org || kept.length === tokens.length) {
		throw new TokenNotFoundError();
	}

	await trx('gp_orgs').where({ id: org.id }).update({ extra_adoption_tokens: JSON.stringify(kept) });
};
