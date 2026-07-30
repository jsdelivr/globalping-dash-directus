import { randomUUID } from 'node:crypto';

const ORGS = [
	{
		name: 'john-org',
		github_id: '9000000001',
		adoption_token: 'johnorgadoptiontoken000000000001',
		members: [
			{ github_username: 'john', role: 'admin' },
			{ github_username: 'john2', first_name: 'John', last_name: '2', role: 'admin', external_identifier: '2000000002', ip: '192.0.2.22' },
			{ github_username: 'john3', first_name: 'John', last_name: '3', role: 'member', external_identifier: '2000000003', ip: '192.0.2.23' },
			{ github_username: 'john4', first_name: 'John', last_name: '4', role: 'member', external_identifier: '2000000004', ip: '192.0.2.24' },
			{ github_username: 'john5', first_name: 'John', last_name: '5', role: 'viewer', external_identifier: '2000000005', ip: '192.0.2.25' },
			{ github_username: 'john6', first_name: 'John', last_name: '6', role: 'viewer', external_identifier: '2000000006', ip: '192.0.2.26' },
		],
	},
	{
		name: 'turk-org',
		github_id: '9000000002',
		adoption_token: 'turkorgadoptiontoken000000000001',
		members: [
			{ github_username: 'turk', role: 'admin' },
			{ github_username: 'turk2', first_name: 'Turk', last_name: '2', role: 'admin', external_identifier: '3000000002', ip: '192.0.2.32' },
			{ github_username: 'turk3', first_name: 'Turk', last_name: '3', role: 'member', external_identifier: '3000000003', ip: '192.0.2.33' },
			{ github_username: 'turk4', first_name: 'Turk', last_name: '4', role: 'member', external_identifier: '3000000004', ip: '192.0.2.34' },
			{ github_username: 'turk5', first_name: 'Turk', last_name: '5', role: 'viewer', external_identifier: '3000000005', ip: '192.0.2.35' },
			{ github_username: 'turk6', first_name: 'Turk', last_name: '6', role: 'viewer', external_identifier: '3000000006', ip: '192.0.2.36' },
		],
	},
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	const userRole = await knex('directus_roles').where({ name: 'User' }).first('id');
	const authCodeApp = await knex('gp_apps').where({ name: 'Auth Code App' }).first('id');
	const discordApp = await knex('gp_apps').where({ name: 'Discord App' }).first('id');

	for (const { name, github_id, adoption_token, members } of ORGS) {
		const orgId = randomUUID();
		await knex('gp_orgs').insert({ id: orgId, name, github_id, adoption_token });
		const orgAccount = await knex('gp_accounts').where({ org: orgId }).first('id');

		for (const member of members) {
			const { github_username: username, role } = member;
			let userId;

			// New users (john2, turk2) get a new user record.
			if (member.external_identifier) {
				userId = randomUUID();

				await knex('directus_users').insert({
					id: userId,
					first_name: member.first_name,
					last_name: member.last_name,
					email: `${username}@example.com`,
					role: userRole.id,
					provider: 'default',
					external_identifier: member.external_identifier,
					email_notifications: 0,
					github_organizations: JSON.stringify([ name ]),
					github_username: username,
					token: `${username}token0000000000000000000000`,
					adoption_token: `${username}adoptiontoken000000000000000`,
					default_prefix: username,
					date_created: new Date(),
				});

			// Existing users (john, turk) keep the items from earlier seeds.
			} else {
				({ id: userId } = await knex('directus_users').where({ github_username: username }).first('id'));
			}

			await knex('gp_org_members').insert({ id: randomUUID(), org: orgId, user: userId, role });

			// Existing users (john, turk) keep the items from earlier seeds.
			if (!member.external_identifier) {
				continue;
			}

			const personalAccount = await knex('gp_accounts').where({ user: userId }).first('id');

			// Everyone gets personal items; admins and members also get org ones (viewers can't own org items).
			// Org approvals use another app since approvals are unique per (user, app) for now.
			const itemSets = [
				{ suffix: '', ip: member.ip.replace('192.0.2.', '198.51.100.'), probeUserId: userId, accountId: personalAccount.id, app: authCodeApp },
				...role !== 'viewer' ? [{ suffix: '-org', ip: member.ip, probeUserId: null, accountId: orgAccount.id, app: discordApp }] : [],
			];

			for (const { suffix, ip, probeUserId, accountId, app } of itemSets) {
				await knex('gp_probes').insert({
					id: randomUUID(),
					uuid: randomUUID(),
					name: `${username}${suffix}-probe`,
					ip,
					asn: 3302,
					network: 'IRIDEOS',
					city: 'Naples',
					country: 'IT',
					countryName: 'Italy',
					continent: 'EU',
					continentName: 'Europe',
					region: 'Southern Europe',
					latitude: 40.85,
					longitude: 14.27,
					status: 'ready',
					version: '0.39.0',
					nodeVersion: 'v22.16.0',
					lastSyncDate: new Date(),
					tags: '[]',
					userId: probeUserId,
					account_id: accountId,
				});

				await knex('gp_tokens').insert({
					name: `${username}${suffix}-token`,
					value: `${username}${suffix}tokenvalue0000000000000`,
					origins: '[]',
					date_created: new Date(),
					user_created: userId,
					account_id: accountId,
				});

				await knex('gp_apps_approvals').insert({
					id: randomUUID(),
					user: userId,
					user_created: userId,
					account_id: accountId,
					app: app.id,
					scopes: JSON.stringify([ 'measurements' ]),
				});
			}
		}
	}

	console.log('Mock organizations created: john-org, turk-org with admin/member/viewer users');
};
