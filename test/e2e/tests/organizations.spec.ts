import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { Org, User } from '../types.ts';
import { prepareMockProbeByIp, randomIP } from '../utils.ts';

const getMembershipId = async (org: Org, user: User) => {
	const membership = await sql('gp_org_members').where({ org: org.id, user: user.id }).first('id');
	return membership.id as string;
};

const createOrgToken = async (api: AxiosInstance, accountId: string) => {
	const token = await api.post('/items/gp_tokens', {
		name: 'e2e-org-token',
		value: (await api.post('/bytes')).data.data,
		account_id: accountId,
	});

	expect(token.status).toBe(200);
	return token.data.data.id as number;
};

const listedIds = async (api: AxiosInstance, collection: string) => {
	const response = await api.get(`/items/${collection}`);
	return response.data.data.map((item: { id: string | number }) => item.id);
};

test('only an org admin can change roles', async ({ org, org2, actors }) => {
	const membershipId = await getMembershipId(org, org.member);

	// The self-promotion of a member is the reason the hook exists: the permission alone lets them update their own row.
	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		const response = await api.patch(`/items/gp_org_members/${membershipId}`, { role: 'admin' });
		expect(response.status).toBe(403);
		expect(response.data.errors[0].message).toBe('Only an admin of the org can change roles.');
	}

	// The admin of the org sets any of the three roles.
	for (const role of [ 'viewer', 'admin', 'member' ]) {
		expect((await actors.admin.patch(`/items/gp_org_members/${membershipId}`, { role })).status).toBe(200);

		const membership = await sql('gp_org_members').where({ id: membershipId }).first('role');
		expect(membership.role).toBe(role);
	}

	// But only inside their own org.
	const otherMembershipId = await getMembershipId(org2, org2.member);
	const inOtherOrg = await actors.admin.patch(`/items/gp_org_members/${otherMembershipId}`, { role: 'admin' });
	expect(inOtherOrg.status).toBe(403);
	expect(inOtherOrg.data.errors[0].message).toBe('Only an admin of the org can change roles.');

	// A Directus admin manages the roles of an org they are not a member of.
	expect((await actors.directusAdmin.patch(`/items/gp_org_members/${otherMembershipId}`, { role: 'admin' })).status).toBe(200);

	const otherMembership = await sql('gp_org_members').where({ id: otherMembershipId }).first('role');
	expect(otherMembership.role).toBe('admin');
});

test('demoting a member to viewer takes their org tokens away', async ({ org, actors }) => {
	const membershipId = await getMembershipId(org, org.member);
	const [ memberToken, adminToken ] = await Promise.all([
		createOrgToken(actors.member, org.account_id),
		createOrgToken(actors.admin, org.account_id),
	]);

	expect((await actors.admin.patch(`/items/gp_org_members/${membershipId}`, { role: 'viewer' })).status).toBe(200);

	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();

	// Promoting them back does not bring the token back, and nothing else is touched.
	expect((await actors.admin.patch(`/items/gp_org_members/${membershipId}`, { role: 'member' })).status).toBe(200);
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeUndefined();
});

test('notification preferences can only be changed on your own membership', async ({ org, actors }) => {
	const membershipId = await getMembershipId(org, org.member);
	const preferences = { low_credits: { enabled: true, parameter: 8000 } };

	expect((await actors.member.patch(`/items/gp_org_members/${membershipId}`, { notification_preferences: preferences })).status).toBe(200);

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		const response = await api.patch(`/items/gp_org_members/${membershipId}`, { notification_preferences: preferences });
		expect(response.status).toBe(403);
		expect(response.data.errors[0].message).toBe('Notification preferences can only be changed on your own membership.');
	}

	expect((await actors.directusAdmin.patch(`/items/gp_org_members/${membershipId}`, { notification_preferences: preferences })).status).toBe(200);
});

test('all memberships are visible to the org admin, and only their own membership for the others', async ({ org, org2, actors }) => {
	const memberships = await sql('gp_org_members').where({ org: org.id }).select('id', 'user');
	const otherOrgMemberships = await sql('gp_org_members').where({ org: org2.id }).select('id');
	const ownMembership = (user: string) => memberships.filter(membership => membership.user === user).map(membership => membership.id);
	const ids = (rows: { id: string }[]) => rows.map(row => row.id).sort();

	expect((await listedIds(actors.admin, 'gp_org_members')).sort()).toEqual(ids(memberships));
	expect(await listedIds(actors.member, 'gp_org_members')).toEqual(ownMembership(org.member.id));
	expect(await listedIds(actors.viewer, 'gp_org_members')).toEqual(ownMembership(org.viewer.id));
	expect(await listedIds(actors.outsider, 'gp_org_members')).toEqual([]);
	expect((await listedIds(actors.otherOrgAdmin, 'gp_org_members')).sort()).toEqual(ids(otherOrgMemberships));
});

test('an org is only visible to its own members, and its adoption token only to its admins', async ({ org, org2, actors }) => {
	expect((await actors.admin.get(`/items/gp_orgs/${org.id}`)).data.data.adoption_token).toBe(org.adoption_token);
	expect((await actors.directusAdmin.get(`/items/gp_orgs/${org.id}`)).data.data.adoption_token).toBe(org.adoption_token);

	for (const api of [ actors.member, actors.viewer ]) {
		const response = await api.get(`/items/gp_orgs/${org.id}`);
		expect(response.data.data.name).toBe(org.name);
		expect(response.data.data.public_probes).toBe(false);
		expect(response.data.data.adoption_token).toBeUndefined();
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/items/gp_orgs/${org.id}`)).status).toBe(403);
	}

	// The same holds for a list read, where the hook has to add the token per row.
	const listedTokens = async (api: AxiosInstance, fields: string) => {
		const response = await api.get(`/items/gp_orgs?fields=${fields}`);
		return response.data.data.map((item: { adoption_token?: string }) => item.adoption_token);
	};

	expect(await listedTokens(actors.admin, 'id,name')).toEqual([ org.adoption_token ]);
	expect(await listedTokens(actors.member, 'id,name')).toEqual([ undefined ]);

	expect(await listedIds(actors.admin, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.member, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.viewer, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.outsider, 'gp_orgs')).toEqual([]);
	expect(await listedIds(actors.otherOrgAdmin, 'gp_orgs')).toEqual([ org2.id ]);
	expect(await listedIds(actors.directusAdmin, 'gp_orgs')).toEqual(expect.arrayContaining([ org.id, org2.id ]));

	// The dashboard filters every list by the account, so a user sees their own and the ones of the orgs they are in.
	expect(await listedIds(actors.admin, 'gp_accounts')).toEqual(expect.arrayContaining([ org.admin.account_id, org.account_id ]));
	expect(await listedIds(actors.viewer, 'gp_accounts')).toEqual(expect.arrayContaining([ org.viewer.account_id, org.account_id ]));
	expect(await listedIds(actors.outsider, 'gp_accounts')).not.toContain(org.account_id);
	expect(await listedIds(actors.otherOrgAdmin, 'gp_accounts')).not.toContain(org.account_id);
});

test('the org adoption tokens can not be read by naming the field anywhere in a query', async ({ org, actors }) => {
	const prefix = org.adoption_token.slice(0, 4);

	const denied = [
		'/items/gp_orgs?fields=id,adoption_token',
		'/items/gp_orgs?fields=id,extra_adoption_tokens',
		'/items/gp_orgs?aggregate[max]=adoption_token',
		'/items/gp_orgs?aggregate[count]=id&groupBy[]=adoption_token',
		'/items/gp_orgs?fields=id&sort=adoption_token',
		'/items/gp_orgs?alias[token]=adoption_token&fields=id,token',
		`/items/gp_orgs?fields=id&filter[adoption_token][_starts_with]=${prefix}`,
		'/items/gp_accounts?fields=id,org.adoption_token',
		'/items/gp_org_members?fields=id,org.adoption_token',
		`/items/gp_org_members?fields=id&filter[org][adoption_token][_starts_with]=${prefix}`,
		`/items/gp_org_members?fields=id,org.id&deep[org][_filter][adoption_token][_starts_with]=${prefix}`,
	];

	for (const api of [ actors.admin, actors.member, actors.viewer ]) {
		for (const url of denied) {
			expect((await api.get(url)).status, url).toBe(403);
		}
	}

	// `search` names no field, so an unreadable one is simply not searched.
	expect((await actors.viewer.get(`/items/gp_orgs?fields=id&search=${org.adoption_token}`)).data.data).toEqual([]);
	expect((await actors.viewer.get(`/items/gp_org_members?fields=id&search=${org.adoption_token}`)).data.data).toEqual([]);
});

test('nothing about a co-member can be read through their membership', async ({ org, actors }) => {
	const { email } = org.member;

	const denied = [
		'/items/gp_org_members?fields=id,user',
		'/items/gp_org_members?fields=id,user.email',
		`/items/gp_org_members?fields=id&filter[user][adoption_token][_starts_with]=${org.member.adoption_token.slice(0, 4)}`,
		`/items/gp_org_members?fields=id&filter[user][email][_eq]=${email}`,
		'/items/gp_org_members?fields=id&sort=user.email',
		'/items/gp_org_members?aggregate[count]=id&groupBy[]=user',
		`/items/gp_org_members?fields=id,user.id&deep[user][_filter][email][_eq]=${email}`,
		`/items/gp_orgs?fields=id&filter[members][user][email][_eq]=${email}`,
		'/items/gp_orgs?fields=id,members.user.email',
	];

	for (const api of [ actors.admin, actors.member, actors.viewer ]) {
		for (const url of denied) {
			expect((await api.get(url)).status, url).toBe(403);
		}
	}
});

test('the org adoption token and the public probes switch can only be changed by an admin, and nothing else about the org is editable', async ({ org, actors }) => {
	const newAdoptionToken = (await actors.admin.post('/bytes')).data.data;
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { adoption_token: newAdoptionToken })).status).toBe(200);
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { adoption_token: 'e2e-not-a-generated-token' })).status).toBe(400);
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { public_probes: true })).status).toBe(200);

	// The name and the GitHub id belong to the sync, not to the admin.
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { name: 'e2e-renamed-org' })).status).toBe(403);

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		const token = (await api.post('/bytes')).data.data;
		expect((await api.patch(`/items/gp_orgs/${org.id}`, { adoption_token: token })).status).toBe(403);
		expect((await api.patch(`/items/gp_orgs/${org.id}`, { public_probes: false })).status).toBe(403);
	}

	const stored = await sql('gp_orgs').where({ id: org.id }).first('adoption_token', 'name', 'public_probes');
	expect(stored.adoption_token).toBe(newAdoptionToken);
	expect(stored.name).toBe(org.name);
	expect(stored.public_probes).toBe(1);

	// A Directus admin is not limited to the adoption token, nor to the orgs they are a member of.
	expect((await actors.directusAdmin.patch(`/items/gp_orgs/${org.id}`, { name: 'e2e-renamed-org' })).status).toBe(200);
	const renamed = await sql('gp_orgs').where({ id: org.id }).first('name');
	expect(renamed.name).toBe('e2e-renamed-org');
});

test('an org admin reads the names of the members', async ({ org, actors }) => {
	// Like the org adoption token, the name is added by a hook, so it comes back without being asked for and cannot be named in `fields`.
	const members = async (api: AxiosInstance) => (await api.get('/items/gp_org_members?fields=id,role&limit=50')).data.data;
	const names = (rows: { role: string; github_username: string }[]) => Object.fromEntries(rows.map(row => [ row.github_username, row.role ]));

	expect(names(await members(actors.admin))).toEqual({
		[org.admin.github_username]: 'admin',
		[org.member.github_username]: 'member',
		[org.viewer.github_username]: 'viewer',
	});

	expect(names(await members(actors.member))).toEqual({ [org.member.github_username]: 'member' });
	expect(names(await members(actors.viewer))).toEqual({ [org.viewer.github_username]: 'viewer' });

	const byName = await actors.admin.get('/items/gp_org_members?filter[github_username][_eq]=e2e-nobody');
	expect(byName.status).toBe(403);
});

test('the users of an org stay unreadable to each other', async ({ org, actors }) => {
	// Nothing of a co-member comes back from /users: not as a field, not through a filter, not through an aggregate.
	expect((await actors.admin.get('/users?fields=id&limit=50')).data.data).toEqual([{ id: org.admin.id }]);

	const byToken = await actors.admin.get(`/users?filter[adoption_token][_starts_with]=${org.member.adoption_token}&fields=id`);
	expect(byToken.data.data).toHaveLength(0);

	const aggregated = await actors.admin.get('/users?groupBy=github_username&aggregate[max]=email,adoption_token');
	expect(aggregated.data.data).toHaveLength(1);
	expect(aggregated.data.data[0].github_username).toBe(org.admin.github_username);
});

test('the extra adoption tokens are visible to admins only and can only be removed', async ({ org, actors }) => {
	const alice = { github_username: 'e2e-alice', token: 'e2e-alice-token' };
	const bob = { github_username: 'e2e-bob', token: 'e2e-bob-token' };
	const mallory = { github_username: 'e2e-mallory', token: 'e2e-mallory-token' };

	await sql('gp_orgs').where({ id: org.id }).update({ extra_adoption_tokens: JSON.stringify([ alice, bob ]) });

	const stored = async () => {
		const row = await sql('gp_orgs').where({ id: org.id }).first('extra_adoption_tokens');
		return JSON.parse(row.extra_adoption_tokens);
	};

	expect((await actors.admin.get(`/items/gp_orgs/${org.id}`)).data.data.extra_adoption_tokens).toEqual([ alice, bob ]);

	for (const api of [ actors.member, actors.viewer ]) {
		expect((await api.get(`/items/gp_orgs/${org.id}`)).data.data.extra_adoption_tokens).toBeUndefined();
	}

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_orgs/${org.id}`, { extra_adoption_tokens: [] })).status).toBe(403);
	}

	const rejected = async (api: AxiosInstance, value: unknown) => {
		const response = await api.patch(`/items/gp_orgs/${org.id}`, { extra_adoption_tokens: value });
		expect(response.status).toBe(400);
		return response.data.errors[0].message;
	};

	expect(await rejected(actors.admin, [ alice, bob, mallory ])).toBe('"extra_adoption_tokens" accepts removals only.');
	expect(await rejected(actors.admin, [ alice, alice ])).toBe('"extra_adoption_tokens" accepts removals only.');
	expect(await rejected(actors.admin, [ alice.token ])).toBe('"extra_adoption_tokens" must be a list of { github_username, token }.');

	// A Directus admin is bound by the same rule.
	expect(await rejected(actors.directusAdmin, [ alice, bob, mallory ])).toBe('"extra_adoption_tokens" accepts removals only.');
	expect(await stored()).toEqual([ alice, bob ]);

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { extra_adoption_tokens: [ bob ] })).status).toBe(200);
	expect(await stored()).toEqual([ bob ]);

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { extra_adoption_tokens: [] })).status).toBe(200);
	expect(await stored()).toEqual([]);
});

test('the selected orgs can only be set on your own row, and non-member orgs are dropped', async ({ org, org2, actors }) => {
	const selected = { selected_orgs: [ org.id ] };
	const readSelected = async () => JSON.parse((await sql('directus_users').where({ id: org.member.id }).first('selected_orgs')).selected_orgs);

	expect((await actors.member.patch(`/users/${org.member.id}`, selected)).status).toBe(200);
	expect(await readSelected()).toEqual([ org.id ]);

	expect((await actors.member.patch(`/users/${org.member.id}`, { selected_orgs: [ org.id, org2.id ] })).status).toBe(200);
	expect(await readSelected()).toEqual([ org.id ]);

	expect((await actors.admin.patch(`/users/${org.member.id}`, selected)).status).toBe(403);
	expect((await actors.outsider.patch(`/users/${org.member.id}`, selected)).status).toBe(403);
});

// PHASE5: remove together with the `userId` parameter.
test('the legacy userId parameter is only accepted for yourself, or from a Directus admin', async ({ org, user: outsider, actors }) => {
	// The own form is what the old dashboard sends.
	expect((await actors.member.get(`/credits-timeline?userId=${org.member.id}`)).status).toBe(200);
	const ownIp = randomIP();
	await prepareMockProbeByIp(ownIp);
	expect((await actors.member.post('/adoption-code/send-code', { userId: org.member.id, ip: ownIp })).status).toBe(200);

	expect((await actors.member.get(`/credits-timeline?userId=${outsider.id}`)).status).toBe(400);
	expect((await actors.member.get(`/applications?userId=${outsider.id}`)).status).toBe(400);
	expect((await actors.member.post('/adoption-code/send-code', { userId: outsider.id, ip: randomIP() })).status).toBe(400);
	expect((await actors.member.post('/adoption-code/verify-code', { userId: outsider.id, code: '111111' })).status).toBe(400);

	expect((await actors.directusAdmin.get(`/credits-timeline?userId=${outsider.id}`)).status).toBe(200);
	expect((await actors.directusAdmin.get(`/applications?userId=${outsider.id}`)).status).toBe(200);
	const adminIp = randomIP();
	await prepareMockProbeByIp(adminIp);
	expect((await actors.directusAdmin.post('/adoption-code/send-code', { userId: outsider.id, ip: adminIp })).status).toBe(200);
});
