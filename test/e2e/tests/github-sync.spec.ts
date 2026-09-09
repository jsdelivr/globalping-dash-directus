import axios, { type AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { Org, User } from '../types.ts';
import { loginUser } from '../utils.ts';

type GithubOrg = { id: number; login: string };

// Webhook-trigger flow seeded in seeds/development/08-flow-triggers.js; lets us run the members cron on demand.
const MANUAL_FLOW_ID = 'ccdde62b-6f94-456e-8f24-73bb22d38547';

const prepareMockGithub = async (user: User, memberships: { role: string; state: string; organization: GithubOrg }[], orgs: GithubOrg[] = [], login = 'e2e-github-user') => {
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, {
		token: user.github_oauth_token,
		username: login,
		githubId: Number(user.external_identifier),
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
		.orderBy('o.github_id')
		.select('o.github_id', 'o.name', 'm.role', 'm.id');
};

const getOrgWithAccount = async (githubId: string) => {
	const org = await sql('gp_orgs').where({ github_id: githubId }).first('id', 'name', 'adoption_token');
	const account = await sql('gp_accounts').where({ org: org.id }).first('id');
	return { ...org, account_id: account.id as string } as Org;
};

const createOrgToken = async (api: AxiosInstance, accountId: string) => {
	const token = await api.post('/items/gp_tokens', {
		name: 'e2e-org-token',
		value: (await api.post('/bytes')).data.data,
		account_id: accountId,
	});

	expect(token.status).toBe(200);
	return token.data.data.id as string;
};

const getSelectedOrgs = async (user: User) => {
	const row = await sql('directus_users').where({ id: user.id }).first('selected_orgs');
	return JSON.parse(row.selected_orgs) as string[];
};

const selectOrgs = (user: User, orgIds: string[]) => {
	return sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify(orgIds) });
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
const triggerMembersCron = () => axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${MANUAL_FLOW_ID}`);

// The org name goes into the GitHub url, and the generated one has spaces in it.
const renameOrg = (org: Org) => {
	org.name = `e2e-check-members-${org.github_id}`;
	return sql('gp_orgs').where({ id: org.id }).update({ name: org.name });
};

// `login` is what GitHub answers with: passing an older one makes the stored login stale, as it is after a rename.
const prepareMockMember = async (user: User, orgs: GithubOrg[], login?: string) => {
	// The bulk check resolves a member by their stored login, and the generated logins repeat between tests while the states live on.
	user.github_username = `${user.github_username}-${user.external_identifier}`;
	await sql('directus_users').where({ id: user.id }).update({ github_username: user.github_username });

	await prepareMockGithub(user, orgs.map(org => membership(org.id, org.login)), [], login ?? user.github_username);
};

test('the members cron removes the memberships of everyone who left, with their org tokens and selection', async ({ org }) => {
	await renameOrg(org);
	const githubOrg = { id: Number(org.github_id), login: org.name };
	const [ adminApi, memberApi ] = await Promise.all([ loginUser(org.admin), loginUser(org.member) ]);
	const [ adminToken, memberToken ] = await Promise.all([ createOrgToken(adminApi, org.account_id), createOrgToken(memberApi, org.account_id) ]);

	await Promise.all([
		prepareMockMember(org.admin, [ githubOrg ]),
		prepareMockMember(org.viewer, [ githubOrg ]),
		// The member is in some other org now, but not in this one.
		prepareMockMember(org.member, [{ id: 1, login: 'e2e-some-other-org' }]),
		selectOrgs(org.member, [ org.id ]),
		selectOrgs(org.viewer, [ org.id ]),
	]);

	await triggerMembersCron();

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.viewer.id ].sort());

	// The org the user is no longer in can not stay in the list the dashboard switcher is built from.
	expect(await getSelectedOrgs(org.member)).toEqual([]);
	expect(await getSelectedOrgs(org.viewer)).toEqual([ org.id ]);

	// The leaver's org tokens are removed by a database trigger; the admin's token and the org itself stay.
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
	expect(await sql('gp_orgs').where({ id: org.id }).first('id')).toBeTruthy();
});

/*
 * A member who renamed themselves on GitHub must not be taken for a leaver: the cron would delete their membership, and the
 * database trigger their org tokens and approvals with it. The cron gets there in three steps:
 * 1. it finds a checker - a member whose own token confirms they are still in the org (the admin here);
 * 2. with the checker's token it asks GitHub about every member at once, by the login stored in our database. The renamed
 *    member's stored login resolves to nobody, so the answer is "unknown", not "left" - while the viewer's list simply has no
 *    such org, which is conclusive;
 * 3. everyone left unknown is asked about with their own token, which answers without a login at all.
 */
test('the members cron does not take a member who renamed themselves on GitHub for a leaver', async ({ org }) => {
	await renameOrg(org);
	const githubOrg = { id: Number(org.github_id), login: org.name };
	const [ adminApi, memberApi ] = await Promise.all([ loginUser(org.admin), loginUser(org.member) ]);
	const [ adminToken, memberToken ] = await Promise.all([ createOrgToken(adminApi, org.account_id), createOrgToken(memberApi, org.account_id) ]);

	await Promise.all([
		prepareMockMember(org.admin, [ githubOrg ]),
		// GitHub knows them under the new login, our database still under the old one.
		prepareMockMember(org.member, [ githubOrg ], 'e2e-renamed-login'),
		// The viewer really did leave: proof that the run checked everyone instead of quietly doing nothing.
		prepareMockMember(org.viewer, [{ id: 1, login: 'e2e-some-other-org' }]),
		selectOrgs(org.member, [ org.id ]),
		selectOrgs(org.viewer, [ org.id ]),
	]);

	await triggerMembersCron();

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.member.id ].sort());

	// The renamed member keeps everything; only the viewer is treated as gone.
	expect(await getSelectedOrgs(org.member)).toEqual([ org.id ]);
	expect(await getSelectedOrgs(org.viewer)).toEqual([]);
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeTruthy();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
});
