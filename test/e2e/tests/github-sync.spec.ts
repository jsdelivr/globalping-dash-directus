import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { loginUser } from '../utils.ts';
import { createOrgToken, getMemberships, getOrgWithAccount, getSelectedOrgs, membership, prepareMockGithub, selectOrgs, sync } from '../github.ts';

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

// The members cron re-checks the orgs of users who never sign in, so it goes through GitHub with the members' own tokens.
