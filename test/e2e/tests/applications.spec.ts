import type { AxiosInstance } from 'axios';
import { client } from '../client.ts';
import { test, expect } from '../fixtures.ts';
import { addApplication } from '../utils.ts';

type ListedApplication = { id: string; user_created: string; account_id: string };

const listed = async (api: AxiosInstance, query: string): Promise<ListedApplication[]> => {
	const response = await api.get(`/applications?${query}&limit=100`);
	expect(response.status).toBe(200);

	return response.data.applications.map(({ id, user_created, account_id }: ListedApplication) => ({ id, user_created, account_id }));
};

// What a revoke has to remove: the approval and the token issued for it, each bound to a creator and an account.
const storedFor = async (appId: string) => {
	const owners = (rows: { user_created: string; account_id: string }[]) => rows.map(row => `${row.user_created}@${row.account_id}`).sort();

	const [ approvals, tokens ] = await Promise.all([
		client('gp_apps_approvals').where({ app: appId }).select('user_created', 'account_id'),
		client('gp_tokens').where({ app_id: appId }).select('user_created', 'account_id'),
	]);

	return { approvals: owners(approvals), tokens: owners(tokens) };
};

test('applications are listed per creator, and a Directus admin sees the whole account', async ({ org, actors }) => {
	const app = await addApplication({ accountId: org.account_id, userId: org.admin.id });
	await addApplication({ accountId: org.account_id, userId: org.member.id, appId: app });
	// The same app approved for a personal account is a separate row and must not show up in the org list.
	await addApplication({ accountId: org.admin.account_id, userId: org.admin.id, appId: app });

	expect(await listed(actors.admin, `accountId=${org.account_id}`)).toEqual([{ id: app, user_created: org.admin.id, account_id: org.account_id }]);
	expect(await listed(actors.member, `accountId=${org.account_id}`)).toEqual([{ id: app, user_created: org.member.id, account_id: org.account_id }]);
	expect(await listed(actors.admin, `accountId=${org.admin.account_id}`)).toEqual([{ id: app, user_created: org.admin.id, account_id: org.admin.account_id }]);

	const impersonated = await listed(actors.directusAdmin, `accountId=${org.account_id}`);
	expect(impersonated).toEqual(expect.arrayContaining([
		{ id: app, user_created: org.admin.id, account_id: org.account_id },
		{ id: app, user_created: org.member.id, account_id: org.account_id },
	]));

	// Without impersonation the admin lists every account at once.
	const allAccounts = await listed(actors.directusAdmin, 'accountId=all');
	expect(allAccounts.length).toBeGreaterThan(impersonated.length);
	expect(new Set(allAccounts.map(application => application.account_id)).size).toBeGreaterThan(1);
});

test('a Directus admin revokes the applications of the impersonated user', async ({ user, user2, actors }) => {
	const app = await addApplication({ accountId: user.account_id, userId: user.id });
	// The same app approved by somebody else has to survive the revoke.
	await addApplication({ accountId: user2.account_id, userId: user2.id, appId: app });

	expect(await listed(actors.directusAdmin, `accountId=${user.account_id}`)).toEqual([{ id: app, user_created: user.id, account_id: user.account_id }]);

	const response = await actors.directusAdmin.post('/applications/revoke', { accountId: user.account_id, userCreated: user.id, id: app });
	expect(response.status).toBe(200);

	expect(await listed(actors.directusAdmin, `accountId=${user.account_id}`)).toEqual([]);
	expect(await listed(actors.directusAdmin, `accountId=${user2.account_id}`)).toEqual([{ id: app, user_created: user2.id, account_id: user2.account_id }]);
	expect(await storedFor(app)).toEqual({ approvals: [ `${user2.id}@${user2.account_id}` ], tokens: [ `${user2.id}@${user2.account_id}` ] });
});

test('an application is revoked for one creator in one account only', async ({ org, actors }) => {
	const app = await addApplication({ accountId: org.account_id, userId: org.admin.id });
	await addApplication({ accountId: org.account_id, userId: org.member.id, appId: app });
	await addApplication({ accountId: org.admin.account_id, userId: org.admin.id, appId: app });

	const inOrg = (userId: string) => `${userId}@${org.account_id}`;
	const personal = `${org.admin.id}@${org.admin.account_id}`;

	// A member can not revoke somebody else's approval - and does not silently revoke their own instead.
	const foreign = await actors.member.post('/applications/revoke', { accountId: org.account_id, userCreated: org.admin.id, id: app });
	expect(foreign.status).toBe(400);
	expect(foreign.data).toBe('You can only revoke your own applications.');

	// Neither does somebody outside the org.
	const outsider = await actors.outsider.post('/applications/revoke', { accountId: org.account_id, id: app });
	expect(outsider.status).toBe(400);
	expect(outsider.data).toBe('You can not access this account.');

	expect(await storedFor(app)).toEqual({
		approvals: [ inOrg(org.admin.id), inOrg(org.member.id), personal ].sort(),
		tokens: [ inOrg(org.admin.id), inOrg(org.member.id), personal ].sort(),
	});

	// The creator revokes their own row: the other member and their own personal approval stay.
	expect((await actors.admin.post('/applications/revoke', { accountId: org.account_id, id: app })).status).toBe(200);

	expect(await storedFor(app)).toEqual({
		approvals: [ inOrg(org.member.id), personal ].sort(),
		tokens: [ inOrg(org.member.id), personal ].sort(),
	});

	// A Directus admin revokes on behalf of the member.
	expect((await actors.directusAdmin.post('/applications/revoke', { accountId: org.account_id, userCreated: org.member.id, id: app })).status).toBe(200);
	expect(await storedFor(app)).toEqual({ approvals: [ personal ], tokens: [ personal ] });

	// And nobody revokes across every account at once.
	const allAccounts = await actors.directusAdmin.post('/applications/revoke', { accountId: 'all', id: app });
	expect(allAccounts.status).toBe(400);
	expect(allAccounts.data).toBe('An application can only be revoked for a single account.');
	expect(await storedFor(app)).toEqual({ approvals: [ personal ], tokens: [ personal ] });
});

// PHASE5: remove - the dashboard sends the account by then.
test('the legacy userId form keeps naming the owner and the creator at once', async ({ user, org, actors }) => {
	const app = await addApplication({ accountId: user.account_id, userId: user.id });
	const listedApp = [{ id: app, user_created: user.id, account_id: user.account_id }];

	// The dashboard of the previous release sends the user of the row, which is its creator as well.
	expect(await listed(actors.outsider, `userId=${user.id}`)).toEqual(listedApp);
	expect(await listed(actors.directusAdmin, `userId=${user.id}`)).toEqual(listedApp);

	// And still refuses to name somebody else.
	const foreign = await actors.outsider.post('/applications/revoke', { userId: org.admin.id, id: app });
	expect(foreign.status).toBe(400);
	expect(foreign.data).toBe('Allowed only for the current user or admin.');

	// The admin revokes for the impersonated user without naming the creator separately.
	expect((await actors.directusAdmin.post('/applications/revoke', { userId: user.id, id: app })).status).toBe(200);
	expect(await storedFor(app)).toEqual({ approvals: [], tokens: [] });
});
