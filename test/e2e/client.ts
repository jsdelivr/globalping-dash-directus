import knex, { Knex } from 'knex';
import { randomUUID } from 'crypto';
import knexfile from '../../knexfile.js';

const env = process.env['NODE_ENV'] || 'development';

export const client: Knex = knex(knexfile[env] || {});

const commonUserFields = {
	first_name: 'John',
	last_name: 'Doe',
	password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
	provider: 'default',
	email_notifications: 1,
	github_organizations: JSON.stringify([ 'Scrubs' ]),
	github_username: 'johndoe',
	user_type: 'sponsor',
};

export const generateUser = async () => {
	const userId = randomUUID();
	const userRole = await client('directus_roles').where({ name: 'User' }).select('id').first();

	return {
		...commonUserFields,
		id: userId,
		external_identifier: randomNumbers(),
		email: `${userId}@example.com`,
		role: userRole.id,
	};
};

export const clearUserData = async (userId: string, externalIdentifier: string) => {
	await client('gp_credits_additions').where({ github_id: externalIdentifier }).delete();
	await client('gp_credits').where({ user_id: userId }).delete();
	await client('gp_credits_deductions').where({ user_id: userId }).delete();
	await client('gp_adopted_probes').where({ userId }).delete();
	await client('gp_tokens').where({ user_created: userId }).delete();
	await client('directus_users').where({ id: userId }).delete();
};

const randomNumbers = () => {
	const randomNumber = Math.floor(Math.random() * 10000000);
	const randomCode = randomNumber.toString().padStart(7, '0');
	return randomCode;
};
