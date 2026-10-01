import type { ApiExtensionContext } from '@directus/extensions';

export const setSponsorshipTier = async (githubId: string, tier: 'sponsor' | 'member', { services, getSchema }: Pick<ApiExtensionContext, 'services' | 'getSchema'>, trx: ApiExtensionContext['database']) => {
	const { ItemsService, UsersService } = services;
	const schema = await getSchema();

	// A github id belongs either to a user or to an organization, so one of the two updates matches.
	await Promise.all([
		new UsersService({ schema, knex: trx }).updateByQuery({ filter: { external_identifier: { _eq: githubId }, user_type: { _neq: 'special' } } }, { user_type: tier }),
		new ItemsService('gp_orgs', { schema, knex: trx }).updateByQuery({ filter: { github_id: { _eq: githubId }, user_type: { _neq: 'special' } } }, { user_type: tier }),
	]);
};
