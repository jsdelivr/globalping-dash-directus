import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { loginUser } from '../utils.ts';

type GithubOrg = { id: number; login: string };

const prepareMockGithub = async (user: User, memberships: { role: string; state: string; organization: GithubOrg }[], orgs: GithubOrg[] = []) => {
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, {
		token: user.github_oauth_token,
		username: 'e2e-github-user',
		memberships,
		orgs,
	});
};

const membership = (id: number, login: string, role = 'member') => ({ state: 'active', role, organization: { id, login } });

const sync = async (user: User) => {
	const api = await loginUser(user);
	const response = await api.post('/sync-github-data', { userId: user.id });
	expect(response.status).toBe(200);
};

const getMemberships = (user: User) => {
	return sql('gp_org_members as m')
		.join('gp_orgs as o', 'o.id', 'm.org')
		.where({ 'm.user': user.id })
		.select('o.github_id', 'o.name', 'm.role', 'm.id');
};

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

	await prepareMockGithub(user, []);
	await sync(user);

	expect(await getMemberships(user)).toEqual([]);
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
