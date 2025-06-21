import { randomUUID } from 'node:crypto';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => knex('directus_users')
		.where({ github_username: 'john' })
		.select('id', 'external_identifier', 'github_username')
		.first();

	const getAuthCodeApp = async () => knex('gp_apps')
		.where({ name: 'Auth Code App' })
		.select('id')
		.first();

	const getClientCredentialsApp = async () => knex('gp_apps')
		.where({ name: 'Client Credentials App' })
		.select('id')
		.first();

	const [ user, authCodeApp, clientCredentialsApp ] = await Promise.all([
		getUser(),
		getAuthCodeApp(),
		getClientCredentialsApp(),
	]);

	await knex('gp_apps_approvals').insert([{
		id: randomUUID(),
		user: user.id,
		app: authCodeApp.id,
		scopes: JSON.stringify([ 'measurements' ]),
	}]);

	await knex('gp_tokens').insert([{
		id: 1,
		name: 'gp-token-1',
		value: '/bSluuDrAPX9zIiZZ/hxEKARwOg+e//EdJgCFpmApbg=', // token: hf2fnprguymlgliirdk7qv23664c2xcr
		date_created: '2025-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: '[]',
		user_created: user.id,
		user_updated: null,
	},
	{
		id: 2,
		name: 'gp-token-2',
		value: '8YZ2pZoGQxfOeEGvUUkagX1yizZckq3weL+IN0chvU0=', // token: vumzijbzihrskmc2hj34yw22batpibmt
		date_created: '2025-02-22 10:57:21',
		date_last_used: '2025-02-21',
		date_updated: '2025-02-22 10:49:45',
		expire: '2027-02-01',
		origins: JSON.stringify([ 'https://www.jsdelivr.com', 'https://www.jsdelivr.com:10000' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 3,
		date_created: '2025-01-03 16:13:45',
		date_last_used: null,
		date_updated: null,
		expire: '2025-07-02',
		name: 'For Auth Code App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: 'mDyYJ7cYn0/txr8fQtqaCxW1MN3bbjBc8y+bz5M4+Cg=', // token: w7nkybaxtfnajebtagdcrxsbqr42kjre
		app_id: authCodeApp.id,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'refresh_token',
		parent: null,
	},
	{
		id: 4,
		date_created: '2025-01-03 16:13:45',
		date_last_used: '2025-01-05',
		date_updated: null,
		expire: '2025-02-02',
		name: 'For Auth Code App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: 't3lHNCiCf17iGssMzftULAGHr8jmttRORB7EeUonYn8=', // token: irhkax22pl5qd6qm6iiegikyndel4hh6
		app_id: authCodeApp.id,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'access_token',
		parent: 3,
	},
	{
		id: 5,
		date_created: '2025-01-06 12:34:36',
		date_last_used: null,
		date_updated: null,
		expire: '2026-01-01',
		name: 'For Client Credentials App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: 'XfP0hC+L1TNOOTIP0U6LX7GWSUDuL/oEqTr+Dm+Z7gg=', // token: cd4j7g2m37e74wxivpuuj2xdt2acl6j6
		app_id: clientCredentialsApp.id,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'refresh_token',
		parent: null,
	},
	{
		id: 6,
		date_created: '2025-01-06 12:34:36',
		date_last_used: '2025-01-06',
		date_updated: null,
		expire: '2025-02-05',
		name: 'For Client Credentials App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: 'jR3Jx0KCKRc6IhuavjG7MqzslEFBDvTEb76hOMvVEx8=', // token: 3f2qkqbct7skzarkpihsrnak2brdasxk
		app_id: clientCredentialsApp.id,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'access_token',
		parent: 5,
	},
	{
		id: 7,
		name: 'XYZ token',
		value: '0u08dZaKMFihg+Bx+Tq+1PY96/MBb+s2KyW32Fu60pc=',
		date_created: '2023-02-22 10:57:21',
		date_last_used: '2024-02-21',
		date_updated: '2023-02-23 10:49:45',
		expire: '2025-02-01',
		origins: JSON.stringify([ 'https://www.globalping.io' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 8,
		name: 'Random token',
		value: 'Jw2eWIZ+Ku5CuvBs/s/cgpIhShQONV52BG9mTJgfi1Y=',
		date_created: '2024-03-15 14:30:00',
		date_last_used: '2024-03-20',
		date_updated: '2024-03-15 14:30:00',
		expire: null,
		origins: JSON.stringify([ 'https://api.globalping.io' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 9,
		name: 'api-key-2024',
		value: '8tV0wX1yZ3aB3cD5fG7hJ9kL2mN4pQ6rS8tV0wX1yZ3=',
		date_created: '2024-03-21 09:15:00',
		date_last_used: '2024-03-22',
		date_updated: '2024-03-21 09:15:00',
		expire: '2025-03-21',
		origins: JSON.stringify([ 'https://api.github.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 10,
		name: 'staging_access_token',
		value: 'sT9uV1xY2z4bC4dE6gH8jK0lM3nO5qR7sT9uV1xY2z4=',
		date_created: '2024-03-22 10:20:00',
		date_last_used: '2024-03-23',
		date_updated: '2024-03-22 10:20:00',
		expire: null,
		origins: JSON.stringify([ 'https://api.stripe.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 11,
		name: 'dev-token-001',
		value: 'tU0vW2xY3z5cD5eF7hI9kL1mN4oP6rS8tU0vW2xY3z5=',
		date_created: '2024-03-23 11:25:00',
		date_last_used: '2024-03-24',
		date_updated: '2024-03-23 11:25:00',
		expire: '2025-03-23',
		origins: JSON.stringify([]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 12,
		name: 'webhook_secret',
		value: 'uV1wX3yZ4a6dE6fG8hJ0lM2nO5pQ7sT9uV1wX3yZ4a6=',
		date_created: '2024-03-24 12:30:00',
		date_last_used: '2024-03-25',
		date_updated: '2024-03-24 12:30:00',
		expire: '2025-03-24',
		origins: JSON.stringify([ 'https://api.slack.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 13,
		name: 'ci-cd-token',
		value: 'vW2xY4z5a7ceF7gH9iK1mN3oP6qR8tU0vW2xY4z5a7c=',
		date_created: '2024-03-25 13:35:00',
		date_last_used: '2024-03-26',
		date_updated: '2024-03-25 13:35:00',
		expire: null,
		origins: JSON.stringify([ 'https://api.digitalocean.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 14,
		name: 'backup_key',
		value: 'V1wX3yZ5a6b8fG8hJ0kL2mN4pQ7sT9uV1wX3yZ5a6b8=',
		date_created: '2024-03-26 14:40:00',
		date_last_used: '2024-03-27',
		date_updated: '2024-03-26 14:40:00',
		expire: '2025-03-26',
		origins: JSON.stringify([]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 15,
		name: 'monitoring-token-2024',
		value: 'W2xY4z6a7b9cgH9iK1lM3nO5qR8tU0vW2xY4z6a7b9c=',
		date_created: '2024-03-27 15:45:00',
		date_last_used: '2024-03-28',
		date_updated: '2024-03-27 15:45:00',
		expire: '2025-03-27',
		origins: JSON.stringify([ 'https://api.datadoghq.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 16,
		name: 'auth_token_p',
		value: 'W2xY4z6a7b9chI0jK2lM4nP6qS8tU0vW2xY4z6a7b9c=',
		date_created: '2024-03-28 16:50:00',
		date_last_used: '2024-03-29',
		date_updated: '2024-03-28 16:50:00',
		expire: null,
		origins: JSON.stringify([ 'https://api.heroku.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 17,
		name: 'service-account-key',
		value: 'W3xY5z7a8b0ciJ1kL3mN5oP7rS9tU1vW3xY5z7a8b0c=',
		date_created: '2024-03-29 17:55:00',
		date_last_used: '2024-03-30',
		date_updated: '2024-03-29 17:55:00',
		expire: '2025-03-29',
		origins: JSON.stringify([]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 18,
		name: 'integration_token',
		value: 'X4yZ6a8b0c2djK2lM4nO6pQ8sT0uV2wX4yZ6a8b0c2d=',
		date_created: '2024-03-30 18:00:00',
		date_last_used: '2024-03-31',
		date_updated: '2024-03-30 18:00:00',
		expire: '2025-03-30',
		origins: JSON.stringify([ 'https://api.aws.amazon.com' ]),
		user_created: user.id,
		user_updated: user.id,
	},
	{
		id: 19,
		name: 'deploy_key_2024',
		value: 'X5yZ7a9b1c3ekL3mN5oP7qR9sT1uV3wX5yZ7a9b1c3e=',
		date_created: '2024-03-31 19:05:00',
		date_last_used: '2024-04-01',
		date_updated: '2024-03-31 19:05:00',
		expire: null,
		origins: JSON.stringify([ 'https://api.cloudflare.com' ]),
		user_created: user.id,
		user_updated: user.id,
	}]);
};
