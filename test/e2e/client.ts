import knex, { Knex } from 'knex';
import knexfile from '../../knexfile.js';

const env = process.env['NODE_ENV'] || 'development';

export const client: Knex = knex(knexfile[env] || {});

export const user = {
	id: '940d4737-394d-428f-b9d5-d98bf1f2a066',
	first_name: 'John',
	last_name: 'Doe',
	email: 'e2e@example.com',
	password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
	provider: 'default',
	external_identifier: '1111111',
	email_notifications: 1,
	github_organizations: JSON.stringify([ 'Scrubs' ]),
	github_username: 'johndoe',
	user_type: 'sponsor',
};

export const clearUserData = async () => {
	await client('gp_credits_additions').where({ github_id: user.external_identifier }).delete();
	await client('gp_credits').where({ user_id: user.id }).delete();
	await client('gp_credits_deductions').where({ user_id: user.id }).delete();
	await client('gp_adopted_probes').where({ userId: user.id }).delete();
	await client('gp_tokens').where({ user_created: user.id }).delete();
};
