import { randomUUID } from 'node:crypto';
import type { EndpointExtensionContext } from '@directus/extensions';
import type { Knex } from 'knex';

const getNames = async (githubIds: string[], database: Knex) => {
	const [ users, orgs ] = await Promise.all([
		database('directus_users').whereIn('external_identifier', githubIds).select<{ external_identifier: string; github_username: string | null }[]>('external_identifier', 'github_username'),
		database('gp_orgs').whereIn('github_id', githubIds).select<{ github_id: string; name: string }[]>('github_id', 'name'),
	]);

	return new Map([
		...users.map(user => [ user.external_identifier, user.github_username ] as const),
		...orgs.map(org => [ org.github_id, org.name ] as const),
	]);
};

export const getRedirects = async (githubId: string, { database }: EndpointExtensionContext) => {
	const redirects = await database('gp_credits_redirects')
		.where({ source_github_id: githubId })
		.orWhere({ target_github_id: githubId })
		.select<{ source_github_id: string; target_github_id: string }[]>('source_github_id', 'target_github_id');

	const names = await getNames(redirects.flatMap(redirect => [ redirect.source_github_id, redirect.target_github_id ]), database);

	return redirects.map(redirect => ({
		source: { githubId: redirect.source_github_id, name: names.get(redirect.source_github_id) ?? redirect.source_github_id },
		target: { githubId: redirect.target_github_id, name: names.get(redirect.target_github_id) ?? redirect.target_github_id },
	}));
};

export const setRedirect = async (githubId: string, targetGithubId: string, trx: Knex.Transaction) => {
	await trx('gp_credits_redirects').where({ source_github_id: githubId }).orWhere({ target_github_id: githubId }).delete();
	await trx('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: githubId, target_github_id: targetGithubId });
};
