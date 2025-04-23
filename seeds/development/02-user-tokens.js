import { randomUUID } from 'node:crypto';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.where({ github_username: 'johndoe' })
			.select('id', 'external_identifier', 'github_username')
			.first();
	};

	let user = await getUser();

	const authCodeAppId = randomUUID();
	const clientCredentialsAppId = randomUUID();
	await knex('gp_apps').insert([{
		id: authCodeAppId,
		user_created: user.id,
		date_created: '2024-09-01 00:00:00',
		name: 'Auth Code App',
		secrets: JSON.stringify([ 'QicY5X3BLipbyojWkfzyd0vRYth/C/2GsCYw6VRfLgI=' ]), // secret: ic3sba25i27s6gic3ksb376krrmtsjbxk2uzn7v5fk6gmiqj
		grants: JSON.stringify([ 'authorization_code', 'refresh_token' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	}, {
		id: clientCredentialsAppId,
		user_created: user.id,
		date_created: '2024-09-01 00:00:00',
		name: 'Client Credentials App',
		owner_name: 'jsDelivr',
		owner_url: 'https://www.jsdelivr.com/',
		secrets: JSON.stringify([ 'xhQKGe2+hSCGgAnYYNF6uBNMFJ1YvcpaRzVs+JSpaWw=' ]), // secret: lyrhib7f2dtuh6fzojvupfhh4olkxofd4kibutw6z5guihvz
		grants: JSON.stringify([ 'globalping_client_credentials', 'refresh_token' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	}]);

	await knex('gp_apps_approvals').insert([{
		id: randomUUID(),
		user: user.id,
		app: authCodeAppId,
		scopes: JSON.stringify([ 'measurements' ]),
	}]);

	await knex('gp_tokens').insert([{
		id: 1,
		name: 'gp-token-1',
		value: '/bSluuDrAPX9zIiZZ/hxEKARwOg+e//EdJgCFpmApbg=', // token: hf2fnprguymlgliirdk7qv23664c2xcr
		date_created: '2024-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: '[]',
		user_created: user.id,
		user_updated: null,
	}, {
		id: 2,
		name: 'gp-token-2',
		value: '8YZ2pZoGQxfOeEGvUUkagX1yizZckq3weL+IN0chvU0=', // token: vumzijbzihrskmc2hj34yw22batpibmt
		date_created: '2024-02-22 10:57:21',
		date_last_used: '2024-02-21',
		date_updated: '2024-02-22 10:49:45',
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
		app_id: authCodeAppId,
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
		app_id: authCodeAppId,
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
		app_id: clientCredentialsAppId,
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
		app_id: clientCredentialsAppId,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'access_token',
		parent: 5,
	},
	]);
};
