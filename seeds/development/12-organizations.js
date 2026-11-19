import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';

const ORGS = [
	{
		name: 'admin-org',
		github_id: '9000000001',
		adoption_token: 'adminorgadoptiontoken00000000001',
		extra_adoption_tokens: [
			{ github_username: 'john', github_id: '1234567890', token: 'johnold1adoptiontoken00000000001' },
			{ github_username: 'john-old2', token: 'johnold2adoptiontoken00000000001' },
		],
		website: 'https://admin-org.example.com',
		description: 'A public sponsor organization where the regular user is an admin.',
		public_probes: 1,
		user_type: 'sponsor',
		sponsors: [{ github_id: '1234567890', github_login: 'john' }],
		members: [
			{ github_username: 'john', role: 'admin', ip: '192.0.2.21', notification_preferences: { probe_adopted: { enabled: false }, low_credits: { enabled: true, emailEnabled: true } } },
			{ github_username: 'teammate', first_name: 'Test', last_name: 'Teammate', role: 'admin', external_identifier: '2000000002', ip: '192.0.2.22' },
		],
	},
	{
		name: 'member-org',
		github_id: '9000000002',
		adoption_token: 'memberorgadoptiontoken0000000001',
		// acme-sponsor sends its credits to member-org through a redirect.
		sponsors: [{ github_id: '2000000002', github_login: 'teammate' }, { github_id: '9200000001', github_login: 'acme-sponsor', redirected: true }],
		members: [
			{ github_username: 'john', role: 'member', ip: '192.0.2.31' },
			{ github_username: 'teammate', role: 'admin', ip: '192.0.2.32' },
		],
	},
	{
		name: 'viewer-org',
		github_id: '9000000003',
		adoption_token: 'viewerorgadoptiontoken0000000001',
		sponsors: [{ github_id: '1234567890', github_login: 'john' }],
		members: [
			{ github_username: 'john', role: 'viewer' },
			{ github_username: 'teammate', role: 'admin', ip: '192.0.2.42' },
		],
	},
	{
		name: 'unclaimed-org',
		// IDs 9000000001..9 already have manual credit additions in 04-user-credits.js.
		github_id: '9000000010',
		adoption_token: 'unclaimedorgadoptiontoken000001',
		populated: false,
		members: [{ github_username: 'john', role: 'member' }],
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

	for (const { members, sponsors = [], populated = true, extra_adoption_tokens: extraAdoptionTokens, ...org } of ORGS) {
		const { name, github_id: githubId } = org;
		const orgId = randomUUID();
		await knex('gp_orgs').insert({ id: orgId, ...org, extra_adoption_tokens: extraAdoptionTokens && JSON.stringify(extraAdoptionTokens) });
		const orgAccount = await knex('gp_accounts').where({ org: orgId }).first('id');

		for (const member of members) {
			const { github_username: username, role } = member;
			let userId;

			// The teammate is created once, then reused in the other organizations.
			if (member.external_identifier) {
				userId = randomUUID();

				await knex('directus_users').insert({
					id: userId,
					first_name: member.first_name,
					last_name: member.last_name,
					email: `${username}@example.com`,
					password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
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

			// John and the reused teammate already exist.
			} else {
				({ id: userId } = await knex('directus_users').where({ github_username: username }).first('id'));
			}

			await knex('gp_org_members').insert({
				id: randomUUID(),
				org: orgId,
				user: userId,
				role,
				notification_preferences: member.notification_preferences && JSON.stringify(member.notification_preferences),
			});

			const personalAccount = await knex('gp_accounts').where({ user: userId }).first('id');

			// John keeps his existing personal data. Only the new teammate needs personal items.
			// Org items are created for every admin/member of a populated org, including reused users.
			const itemSets = [
				...member.external_identifier ? [{ suffix: '', ip: member.ip.replace('192.0.2.', '198.51.100.'), probeUserId: userId, accountId: personalAccount.id, app: authCodeApp, systemTags: [] }] : [],
				...populated && role !== 'viewer' ? [{ suffix: `-${name}`, ip: member.ip, probeUserId: null, accountId: orgAccount.id, app: discordApp, systemTags: org.public_probes ? [ `u-${name}` ] : [] }] : [],
			];

			for (const { suffix, ip, probeUserId, accountId, app, systemTags } of itemSets) {
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
					systemTags: JSON.stringify(systemTags),
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

		if (populated) {
			await seedOrgCredits(knex, { name, orgAccountId: orgAccount.id, githubId });
			await seedOrgSponsors(knex, { githubId, sponsors });
		}
	}

	for (const username of [ 'john', 'teammate' ]) {
		const user = await knex('directus_users').where({ github_username: username }).first('id', 'github_organizations');
		const account = await knex('gp_accounts').where({ user: user.id }).first('id');
		const orgs = await knex('gp_org_members').join('gp_orgs', 'gp_orgs.id', 'gp_org_members.org').where({ user: user.id }).select('gp_orgs.id', 'gp_orgs.name');

		await knex('directus_users').where({ id: user.id }).update({
			github_organizations: JSON.stringify([ ...new Set([ ...JSON.parse(user.github_organizations), ...orgs.map(org => org.name) ]) ]),
			selected_orgs: JSON.stringify(orgs.filter(org => org.name !== 'unclaimed-org').map(org => org.id)),
			default_account: account.id,
		});
	}

	console.log('Mock organizations created: admin-org, member-org, viewer-org and unclaimed-org. Teammate login: teammate@example.com password: user');
};

// Sponsorship and probe credits of the org itself, so the org credits page has a history to show.
const seedOrgCredits = async (knex, { name, orgAccountId, githubId }) => {
	const probe = await knex('gp_probes').where({ account_id: orgAccountId }).first('id', 'ip', 'name');

	await knex('gp_credits_additions').insert([
		{
			amount: 60000,
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ amountInDollars: 30 }),
			consumed: 1,
			date_created: relativeDayUtc(-10),
			github_id: githubId,
		},
		...Array.from(Array(12).keys()).map(i => ({
			amount: 20000,
			reason: 'recurring_sponsorship',
			meta: JSON.stringify({ amountInDollars: 10 }),
			consumed: 1,
			date_created: relativeDayUtc(-i * 30),
			github_id: githubId,
		})),
		...probe ? Array.from(Array(30).keys()).map(i => ({
			amount: 150,
			reason: 'adopted_probe',
			meta: JSON.stringify({ id: probe.id, name: probe.name, ip: probe.ip }),
			consumed: 1,
			date_created: relativeDayUtc(-i),
			github_id: githubId,
			adopted_probe: probe.id,
		})) : [],
	]);

	// Each update is turned into a deduction row by a database trigger; the dates are spread out afterwards.
	for (const i of Array.from(Array(20).keys())) {
		await knex('gp_credits').where({ account_id: orgAccountId }).update({ amount: knex.raw('amount - ?', [ 5000 ]) });
		await knex('gp_credits_deductions').where({ account_id: orgAccountId }).orderBy('date', 'desc').limit(1).update({ date: relativeDayUtc((i + 1) * -3) });
	}

	console.log(`Mock credits created for ${name}`);
};

// Sponsorships paid by other GitHub accounts into the org, so the sponsors page shows sponsors that are not the receiver.
const seedOrgSponsors = async (knex, { githubId, sponsors }) => {
	for (const { github_id: sponsorGithubId, github_login: githubLogin, redirected } of sponsors) {
		if (redirected) {
			await knex('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: sponsorGithubId, target_github_id: githubId }).onConflict('source_github_id').merge();
			await knex('sponsors').insert({ github_id: sponsorGithubId, github_login: githubLogin, monthly_amount: 25, last_earning_date: relativeDayUtc(-5) });
		}

		const meta = { sponsorGithubId, githubLogin };

		await knex('gp_credits_additions').insert([
			{
				amount: 40000,
				reason: 'one_time_sponsorship',
				meta: JSON.stringify({ ...meta, amountInDollars: 20 }),
				consumed: 1,
				date_created: relativeDayUtc(-20),
				github_id: githubId,
			},
			...Array.from(Array(3).keys()).map(i => ({
				amount: 50000,
				reason: 'recurring_sponsorship',
				meta: JSON.stringify({ ...meta, amountInDollars: 25 }),
				consumed: 1,
				date_created: relativeDayUtc(-5 - i * 30),
				github_id: githubId,
			})),
		]);
	}
};
