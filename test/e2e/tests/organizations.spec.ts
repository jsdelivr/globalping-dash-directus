import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { Org, User } from '../types.ts';
import { randomIP } from '../utils.ts';

const getMembershipId = async (org: Org, user: User) => {
	const membership = await sql('gp_org_members').where({ org: org.id, user: user.id }).first('id');
	return membership.id as string;
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
		expect(response.status).toBe(400);
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
	expect(inOtherOrg.status).toBe(400);
	expect(inOtherOrg.data.errors[0].message).toBe('Only an admin of the org can change roles.');

	// A Directus admin manages the roles of an org they are not a member of.
	expect((await actors.directusAdmin.patch(`/items/gp_org_members/${otherMembershipId}`, { role: 'admin' })).status).toBe(200);

	const otherMembership = await sql('gp_org_members').where({ id: otherMembershipId }).first('role');
	expect(otherMembership.role).toBe('admin');
});

test('notification preferences can only be changed on your own membership', async ({ org, actors }) => {
	const membershipId = await getMembershipId(org, org.member);
	const preferences = { low_credits: { enabled: true, parameter: 8000 } };

	expect((await actors.member.patch(`/items/gp_org_members/${membershipId}`, { notification_preferences: preferences })).status).toBe(200);

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		const response = await api.patch(`/items/gp_org_members/${membershipId}`, { notification_preferences: preferences });
		expect(response.status).toBe(400);
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
	for (const api of [ actors.admin, actors.directusAdmin ]) {
		expect((await api.get(`/items/gp_orgs/${org.id}`)).data.data.adoption_token).toBe(org.adoption_token);
	}

	for (const api of [ actors.member, actors.viewer ]) {
		const response = await api.get(`/items/gp_orgs/${org.id}`);
		expect(response.data.data.name).toBe(org.name);
		expect(response.data.data.adoption_token).toBeUndefined();
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/items/gp_orgs/${org.id}`)).status).toBe(403);
	}

	// The same holds for a list read, where the hook has to strip the token per row.
	const listedTokens = async (api: AxiosInstance, fields: string) => {
		const response = await api.get(`/items/gp_orgs?fields=${fields}`);
		return response.data.data.map((item: { adoption_token?: string }) => item.adoption_token);
	};

	expect(await listedTokens(actors.admin, 'id,adoption_token')).toEqual([ org.adoption_token ]);
	expect(await listedTokens(actors.member, 'id,adoption_token')).toEqual([ undefined ]);

	// Without the id the hook can not tell whose org the row is, so it strips the token from everybody but a Directus admin.
	expect(await listedTokens(actors.admin, 'adoption_token')).toEqual([ undefined ]);
	expect(await listedTokens(actors.directusAdmin, 'adoption_token')).toEqual(expect.arrayContaining([ org.adoption_token ]));

	expect(await listedIds(actors.admin, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.member, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.viewer, 'gp_orgs')).toEqual([ org.id ]);
	expect(await listedIds(actors.outsider, 'gp_orgs')).toEqual([]);
	expect(await listedIds(actors.otherOrgAdmin, 'gp_orgs')).toEqual([ org2.id ]);
	expect(await listedIds(actors.directusAdmin, 'gp_orgs')).toEqual(expect.arrayContaining([ org.id, org2.id ]));

	// The accounts themselves are not exposed to the users: they are only ever reached through the items they own.
	for (const api of [ actors.admin, actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get('/items/gp_accounts')).status).toBe(403);
	}

	expect((await actors.directusAdmin.get('/items/gp_accounts')).status).toBe(200);
});

test('the org adoption token can only be regenerated by an admin, and nothing else about the org is editable', async ({ org, actors }) => {
	const newAdoptionToken = (await actors.admin.post('/bytes')).data.data;
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { adoption_token: newAdoptionToken })).status).toBe(200);
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { adoption_token: 'e2e-not-a-generated-token' })).status).toBe(400);

	// The name and the GitHub id belong to the sync, not to the admin.
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { name: 'e2e-renamed-org' })).status).toBe(403);

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		const token = (await api.post('/bytes')).data.data;
		expect((await api.patch(`/items/gp_orgs/${org.id}`, { adoption_token: token })).status).toBe(403);
	}

	const stored = await sql('gp_orgs').where({ id: org.id }).first('adoption_token', 'name');
	expect(stored.adoption_token).toBe(newAdoptionToken);
	expect(stored.name).toBe(org.name);

	// A Directus admin is not limited to the adoption token, nor to the orgs they are a member of.
	expect((await actors.directusAdmin.patch(`/items/gp_orgs/${org.id}`, { name: 'e2e-renamed-org' })).status).toBe(200);
	const renamed = await sql('gp_orgs').where({ id: org.id }).first('name');
	expect(renamed.name).toBe('e2e-renamed-org');
});

// PHASE4: remove together with the `userId` parameter.
test('the legacy userId parameter is only accepted for yourself, or from a Directus admin', async ({ org, user: outsider, actors }) => {
	// The own form is what the old dashboard sends.
	expect((await actors.member.get(`/credits-timeline?userId=${org.member.id}`)).status).toBe(200);
	expect((await actors.member.post('/adoption-code/send-code', { userId: org.member.id, ip: randomIP() })).status).toBe(200);

	expect((await actors.member.get(`/credits-timeline?userId=${outsider.id}`)).status).toBe(400);
	expect((await actors.member.get(`/applications?userId=${outsider.id}`)).status).toBe(400);
	expect((await actors.member.post('/adoption-code/send-code', { userId: outsider.id, ip: randomIP() })).status).toBe(400);
	expect((await actors.member.post('/adoption-code/verify-code', { userId: outsider.id, code: '111111' })).status).toBe(400);

	expect((await actors.directusAdmin.get(`/credits-timeline?userId=${outsider.id}`)).status).toBe(200);
	expect((await actors.directusAdmin.get(`/applications?userId=${outsider.id}`)).status).toBe(200);
	expect((await actors.directusAdmin.post('/adoption-code/send-code', { userId: outsider.id, ip: randomIP() })).status).toBe(200);
});
