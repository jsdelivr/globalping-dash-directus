import { randomBytes } from 'node:crypto';
import { randomUUID } from 'crypto';
import { client } from './client.ts';
import { User } from './types.ts';

export const generateUser = async (suffix = ''): Promise<User> => {
	const userId = randomUUID();
	const userRole = await client('directus_roles').where({ name: 'User' }).select('id').first();

	return {
		id: userId,
		external_identifier: randomExternalId(),
		email: `${userId.split('-')[0]}@example.com`,
		role: userRole.id,
		first_name: `John${suffix}`,
		last_name: `Doe${suffix}`,
		password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
		provider: 'default',
		email_notifications: 0,
		github_organizations: JSON.stringify([ `Scrubs${suffix}` ]),
		github_username: `johndoe${suffix}`,
		user_type: 'sponsor',
	};
};

export const clearUserData = async (user: User) => {
	await client('gp_credits_additions').where({ github_id: user.external_identifier }).delete();
	await client('gp_credits').where({ user_id: user.id }).delete();
	await client('gp_credits_deductions').where({ user_id: user.id }).delete();
	await client('gp_probes').where({ userId: user.id }).delete();
	await client('gp_tokens').where({ user_created: user.id }).delete();
	await client('gp_apps').where({ user_created: user.id }).delete();
	await client('gp_apps_approvals').where({ user: user.id }).delete();
	await client('directus_users').where({ id: user.id }).delete();
};

const randomExternalId = () => {
	const randomNumber = Math.floor(Math.random() * 10000000);
	const randomCode = randomNumber.toString().padStart(7, '0');
	return randomCode;
};

export const randomToken = () => {
	return randomBytes(20).toString('base64');
};

export const randomIP = () => {
	return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
};
