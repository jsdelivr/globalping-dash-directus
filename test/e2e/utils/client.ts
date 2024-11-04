import knex, { Knex } from 'knex';
import knexfile from '../../../knexfile.js';

const env = process.env['NODE_ENV'] || 'e2e';

export const client: Knex = knex(knexfile[env] || {});

export const getUser = async () => {
	return client('directus_users')
		.join('directus_roles', 'directus_users.role', 'directus_roles.id')
		.where({ 'directus_roles.name': 'User' })
		.select('directus_users.id', 'directus_users.external_identifier', 'directus_users.github_username')
		.first();
};
