import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { loginUser } from '../utils.ts';
import { createOrgToken, getMemberships, getOrgWithAccount, getSelectedOrgs, membership, prepareMockGithub, selectOrgs, sync } from '../github.ts';

const defaultTagChangeMessages = async (userIds: string[]) => {
	const rows = await sql('directus_notifications')
		.where({ type: 'default_tag_change' })
		.whereIn('recipient', userIds)
		.select('recipient', 'message');

	return rows as { recipient: string; message: string }[];
};

// Opens the confirmation link that the notification carries.
const confirmDefaultTag = async (message: string) => {
	const data = /data=([\w.-]+)/.exec(message)![1];
	const response = await axios.post(`${process.env.DIRECTUS_URL}/sync-github-data/default-tag/confirm`, null, { params: { data } });
	expect(response.status).toBe(200);
};

const prefixesOf = (userId: string) => sql('directus_users').where({ id: userId }).first('default_prefix', 'deprecated_prefix');

test.afterEach(async () => {
	await sql('gp_orgs').whereIn('github_id', [ '9100001', '9100002' ]).delete();
});

test('creates the org with its account and the membership', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);

	await sync(user);

	expect(await getMemberships(user)).toMatchObject([{ github_id: '9100001', name: 'e2e-sync-org', role: 'admin' }]);

	// The account is created by a database trigger, so the org gets one without the sync knowing about it.
	const org = await sql('gp_orgs').where({ github_id: '9100001' }).first('id', 'adoption_token');
	expect(await sql('gp_accounts').where({ org: org.id }).first('id')).toBeTruthy();
	expect(org.adoption_token).toBeTruthy();
});

test('claims the unconsumed sponsorship additions of the org', async ({ user }) => {
	await sql('gp_credits_additions').insert({
		github_id: '9100001',
		amount: 7000,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({ amountInDollars: 35 }),
		consumed: 0,
	});

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);

	await sync(user);

	const org = await sql('gp_orgs').where({ github_id: '9100001' }).first('id');
	const account = await sql('gp_accounts').where({ org: org.id }).first('id');
	const credits = await sql('gp_credits').where({ account_id: account.id }).first('amount');

	expect(credits.amount).toBe(7000);

	const addition = await sql('gp_credits_additions').where({ github_id: '9100001' }).first('consumed');
	expect(Boolean(addition.consumed)).toBe(true);
});

test('promotes a member to admin, and never demotes back', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org') ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ role: 'member' }]);

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ role: 'admin' }]);

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org') ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ role: 'admin' }]);
});

test('leaves a role set by hand alone, unless GitHub makes them an admin', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org') ]);
	await sync(user);

	// An org admin lowered the role in the dashboard; GitHub knows nothing about `viewer` and must not undo it.
	await sql('gp_org_members').where({ user: user.id }).update({ role: 'viewer' });

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org') ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ role: 'viewer' }]);

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);
	expect(await getMemberships(user)).toMatchObject([{ role: 'admin' }]);
});

test('adds an org that only the public list shows, without an admin', async ({ user }) => {
	await prepareMockGithub(user, [], [{ id: 9100002, login: 'e2e-restricted-org' }]);

	await sync(user);

	expect(await getMemberships(user)).toMatchObject([{ github_id: '9100002', role: 'member' }]);
});

test('removes the membership of an org the user left, with their org tokens', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);

	const org = await sql('gp_orgs').where({ github_id: '9100001' }).first('id');
	const account = await sql('gp_accounts').where({ org: org.id }).first('id');

	const api = await loginUser(user);
	const token = await api.post('/items/gp_tokens', {
		name: 'e2e-org-token',
		value: (await api.post('/bytes')).data.data,
		account_id: account.id,
	});
	expect(token.status).toBe(200);

	await sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });

	await prepareMockGithub(user, []);
	await sync(user);

	expect(await getMemberships(user)).toEqual([]);

	// The org can not stay in the list the dashboard switcher is built from.
	const { selected_orgs: selectedOrgs } = await sql('directus_users').where({ id: user.id }).first('selected_orgs');
	expect(JSON.parse(selectedOrgs)).toEqual([]);
	// The tokens and approvals of the member are removed by a database trigger, the org itself stays.
	expect(await sql('gp_tokens').where({ id: token.data.data.id }).first('id')).toBeUndefined();
	expect(await sql('gp_orgs').where({ id: org.id }).first('id')).toBeTruthy();
});

test('reports a GitHub failure without changing anything', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);

	// A token nothing was set for: the mock answers with an empty state, which is not a failure - so drop the token instead.
	await sql('directus_users').where({ id: user.id }).update({ github_oauth_token: null });

	const api = await loginUser(user);
	const response = await api.post('/sync-github-data', { userId: user.id });

	expect(response.status).toBe(400);
	expect(await getMemberships(user)).toMatchObject([{ github_id: '9100001' }]);
});

test('joins an org another user already created, and follows its rename on GitHub', async ({ user, user2 }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);

	const created = await getOrgWithAccount('9100001');

	// The second user sees the same org under its new name, plus one of their own.
	await prepareMockGithub(user2, [ membership(9100001, 'e2e-sync-org-renamed'), membership(9100002, 'e2e-second-org', 'admin') ]);
	await sync(user2);

	expect(await sql('gp_orgs').where({ github_id: '9100001' }).select('id')).toHaveLength(1);

	// The org is matched by its GitHub id, so it is renamed in place and keeps its account and adoption token.
	const org = await getOrgWithAccount('9100001');
	expect(org).toMatchObject({ id: created.id, name: 'e2e-sync-org-renamed', adoption_token: created.adoption_token, account_id: created.account_id });
	expect(await sql('gp_accounts').where({ org: org.id }).select('id')).toHaveLength(1);

	expect(await getMemberships(user)).toMatchObject([{ github_id: '9100001', role: 'admin' }]);

	// Without public probes nobody uses the old tag, so it is not kept and nobody is asked to confirm.
	expect(await sql('gp_orgs').where({ id: org.id }).first('deprecated_prefix')).toEqual({ deprecated_prefix: null });
	expect(await defaultTagChangeMessages([ user.id, user2.id ])).toEqual([]);

	expect(await getMemberships(user2)).toMatchObject([
		{ github_id: '9100001', role: 'member' },
		{ github_id: '9100002', role: 'admin' },
	]);
});

test('removes only the org the user left, keeping the rest with their tokens and selection', async ({ user }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin'), membership(9100002, 'e2e-second-org', 'admin') ]);
	await sync(user);

	const [ left, kept ] = await Promise.all([ getOrgWithAccount('9100001'), getOrgWithAccount('9100002') ]);
	const api = await loginUser(user);
	const leftToken = await createOrgToken(api, left.account_id);
	const keptToken = await createOrgToken(api, kept.account_id);
	await selectOrgs(user, [ left.id, kept.id ]);

	await prepareMockGithub(user, [ membership(9100002, 'e2e-second-org', 'admin') ]);
	await sync(user);

	expect(await getMemberships(user)).toMatchObject([{ github_id: '9100002' }]);
	expect(await getSelectedOrgs(user)).toEqual([ kept.id ]);
	expect(await sql('gp_tokens').where({ id: leftToken }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: keptToken }).first('id')).toBeTruthy();
});

test('an org rename with public probes keeps the old tag until an org admin confirms the new one', async ({ user, user2 }) => {
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ]);
	await sync(user);
	await prepareMockGithub(user2, [ membership(9100001, 'e2e-sync-org') ]);
	await sync(user2);
	const org = await getOrgWithAccount('9100001');
	await sql('gp_orgs').where({ id: org.id }).update({ public_probes: 1 });
	// Org notifications reach only the admins who selected the org.
	await selectOrgs(user, [ org.id ]);

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org-renamed', 'admin') ]);
	await sync(user);

	expect(await sql('gp_orgs').where({ github_id: '9100001' }).first('name', 'deprecated_prefix')).toEqual({ name: 'e2e-sync-org-renamed', deprecated_prefix: 'e2e-sync-org' });

	const messages = await defaultTagChangeMessages([ user.id, user2.id ]);
	expect(messages.map(message => message.recipient)).toEqual([ user.id ]);

	await confirmDefaultTag(messages[0]!.message);
	expect(await sql('gp_orgs').where({ github_id: '9100001' }).first('deprecated_prefix')).toEqual({ deprecated_prefix: null });
});

test('a default prefix the user has no claim to is reset, and the old one is kept until the user confirms', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({ default_prefix: 'e2e-sync-org', public_probes: 1 });

	await prepareMockGithub(user, [], [], user.github_username);
	await sync(user);

	expect(await prefixesOf(user.id)).toEqual({ default_prefix: user.github_username, deprecated_prefix: 'e2e-sync-org' });

	const [ notification ] = await defaultTagChangeMessages([ user.id ]);
	await confirmDefaultTag(notification!.message);
	expect(await prefixesOf(user.id)).toEqual({ default_prefix: user.github_username, deprecated_prefix: null });
});

test('a default prefix set to an org name of the user stays while the org keeps that name, and is reset when the org is renamed', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({ default_prefix: 'e2e-sync-org', public_probes: 1 });
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org') ], [], user.github_username);
	await sync(user);

	expect(await prefixesOf(user.id)).toEqual({ default_prefix: 'e2e-sync-org', deprecated_prefix: null });

	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org-renamed') ], [], user.github_username);
	await sync(user);

	expect(await prefixesOf(user.id)).toEqual({ default_prefix: user.github_username, deprecated_prefix: 'e2e-sync-org' });
});

test('a name taken by an org or a user stops being the deprecated tag of anybody', async ({ user, user2, org }) => {
	const deprecate = async (name: string) => {
		await sql('directus_users').where({ id: user2.id }).update({ deprecated_prefix: name });
		await sql('gp_orgs').where({ id: org.id }).update({ deprecated_prefix: name });
	};

	const deprecatedPrefixes = async () => [
		(await prefixesOf(user2.id)).deprecated_prefix,
		(await sql('gp_orgs').where({ id: org.id }).first('deprecated_prefix')).deprecated_prefix,
	];

	await deprecate('e2e-sync-org');
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org', 'admin') ], [], user.github_username);
	await sync(user);
	expect(await deprecatedPrefixes()).toEqual([ null, null ]);

	await deprecate('e2e-sync-org-renamed');
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org-renamed', 'admin') ], [], user.github_username);
	await sync(user);
	expect(await deprecatedPrefixes()).toEqual([ null, null ]);

	const login = `${user.github_username}-renamed`;
	await deprecate(login);
	await prepareMockGithub(user, [ membership(9100001, 'e2e-sync-org-renamed', 'admin') ], [], login);
	await sync(user);
	expect(await deprecatedPrefixes()).toEqual([ null, null ]);
});
