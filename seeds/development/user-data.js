import { randomUUID } from 'node:crypto';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const getUser = async () => {
		return knex('directus_users')
			.join('directus_roles', 'directus_users.role', 'directus_roles.id')
			.where({ 'directus_roles.name': 'User' })
			.select('directus_users.id', 'directus_users.external_identifier', 'directus_users.github_username')
			.first();
	};

	let user = await getUser();

	if (!user) {
		const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();

		await knex('directus_users').insert([{
			id: 'b2193f5b-4a8b-4513-8e5a-1559478bebde',
			first_name: 'Dmitriy',
			last_name: 'Akulov',
			email: 'user@example.com',
			password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
			role: userRole.id,
			provider: 'default',
			external_identifier: '1834071',
			email_notifications: 0,
			github_organizations: JSON.stringify([ 'MaxCDN', 'appfleetcloud', 'jsdelivr', 'nice-registry', 'polyfills' ]),
			github_username: 'jimaek',
			user_type: 'member',
			adoption_token: 'HwuHxzK9ewaFjhWcFR0m3zPTuqyITyql',
			default_prefix: 'jimaek',
		}]);

		console.log('Mock user created. email: user@example.com password: user');

		user = await getUser();
	}

	await Promise.all([
		knex('gp_apps').delete(),
		knex('gp_tokens').delete(),
		knex('gp_probes').delete(),
		knex('sponsors').delete(),
		knex('gp_credits_additions').delete(),
		knex('gp_credits_deductions').delete(),
		knex('gp_credits').delete(),
	]);

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

	const probeId = randomUUID();
	await knex('gp_probes').insert([{
		id: probeId,
		asn: 3302,
		city: 'Naples',
		country: 'IT',
		countryOfCustomCity: 'IT',
		date_created: '2024-02-22 11:04:30',
		date_updated: '2024-02-22 11:05:48',
		ip: '2a03:5c00:0:a01::54:cf',
		altIps: JSON.stringify([ '213.136.174.80' ]),
		isCustomCity: 1,
		lastSyncDate: new Date(),
		latitude: 40.85,
		longitude: 14.27,
		name: 'adopted-probe-2',
		network: 'IRIDEOS S.P.A.',
		onlineTimesToday: 120,
		state: null,
		status: 'ready',
		tags: JSON.stringify([{ value: 'tag-1', prefix: user.github_username }]),
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		userId: user.id,
		uuid: '681023cb-6aec-45a1-adde-e705c4043549',
		version: '0.28.0',
		hardwareDevice: null,
	},
	{
		id: randomUUID(),
		asn: 61493,
		city: 'Buenos Aires',
		country: 'AR',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: '131.255.7.26',
		altIps: JSON.stringify([ '2800:2502:7:2a2f:1::c423:70d' ]),
		isCustomCity: 0,
		lastSyncDate: new Date(),
		latitude: -34.61,
		longitude: -58.38,
		name: null,
		network: 'InterBS S.R.L. (BAEHOST)',
		onlineTimesToday: 0,
		state: null,
		status: 'ready',
		tags: '[]',
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		userId: user.id,
		uuid: 'b42c4319-6be3-46d4-8a01-d4558f0c070c',
		version: '0.28.0',
		hardwareDevice: null,
	},
	{
		id: randomUUID(),
		asn: 16019,
		city: 'Prague',
		country: 'CZ',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: '2001:67c:2d38:2000:3000:9c0:876a:130b',
		altIps: JSON.stringify([ '45.90.103.202', '2001:67c:2d38:2000::b304:32a' ]),
		isCustomCity: 0,
		lastSyncDate: new Date(),
		latitude: 50.07,
		longitude: 14.42,
		name: null,
		network: 'Vodafone Czech Republic a.s.',
		systemTags: JSON.stringify([ 'eyeball-network' ]),
		onlineTimesToday: 0,
		state: null,
		status: 'offline',
		tags: '[]',
		userId: null,
		uuid: '70b83916-ba6d-481e-adea-4fe9d77761fd',
		version: '0.28.0',
		hardwareDevice: null,
	},
	{
		id: randomUUID(),
		asn: 43939,
		city: 'Krakow',
		country: 'PL',
		countryOfCustomCity: null,
		date_created: '2024-12-06 16:44:07',
		date_updated: null,
		ip: '95.155.94.127',
		altIps: '[]',
		isCustomCity: 0,
		lastSyncDate: '2024-12-06',
		latitude: 50.06,
		longitude: 19.94,
		name: 'probe-pl-krakow-01',
		network: 'Netia SA',
		onlineTimesToday: 0,
		state: null,
		status: 'offline',
		tags: '[]',
		userId: user.id,
		uuid: '6ed2e3af-8f7b-4d49-b5bf-d4a37f3668aa',
		version: '0.34.0',
		hardwareDevice: 'v1',
		hardwareDeviceFirmware: 'v2.0',
		nodeVersion: 'v20.18.0',
		isIPv4Supported: 1,
		isIPv6Supported: 1,
		systemTags: '[]',
	}]);

	await knex('sponsors').insert([{
		date_created: '2024-02-22 11:48:00',
		date_updated: null,
		user_created: null,
		user_updated: null,
		github_id: user.external_identifier,
		github_login: user.github_username,
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 5,
	},
	{
		date_created: '2024-02-22 11:48:00',
		date_updated: null,
		user_created: null,
		user_updated: null,
		github_id: '6192491',
		github_login: 'MartinKolarik',
		last_earning_date: '2024-02-22 11:48:00',
		monthly_amount: 100,
	}]);

	await knex('gp_credits_additions').insert([{
		amount: 10000,
		comment: 'One-time $50 sponsorship.',
		consumed: 1,
		date_created: '2024-01-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 1000,
		comment: 'Recurring $5 sponsorship.',
		consumed: 1,
		date_created: '2024-02-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 150,
		comment: 'Adopted probe "adopted-probe-2" (213.136.174.80).',
		consumed: 1,
		date_created: '2024-03-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	},
	{
		amount: 150,
		comment: 'Adopted probe "adopted-probe-2" (213.136.174.80).',
		consumed: 1,
		date_created: '2024-03-06 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	},
	{
		amount: 150,
		comment: 'Adopted probe "adopted-probe-2" (213.136.174.80).',
		consumed: 1,
		date_created: '2024-03-07 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	},
	{
		amount: 150,
		comment: 'Adopted probe "adopted-probe-2" (213.136.174.80).',
		consumed: 1,
		date_created: '2024-03-08 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	}, {
		amount: 2000,
		comment: 'One-time $10 sponsorship.',
		consumed: 1,
		date_created: '2024-04-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	{
		amount: 3000,
		comment: 'Recurring $15 sponsorship.',
		consumed: 1,
		date_created: '2024-05-05 11:46:22',
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	}]);

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 6000 ]) });

	await knex('gp_credits_deductions').where({ user_id: user.id }).update({ date: '2024-04-01' });

	await knex('gp_credits').where({ user_id: user.id }).update({ amount: knex.raw('amount - ?', [ 5000 ]) });
};
