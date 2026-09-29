import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { addProbe, allUsers, randomIP } from '../utils.ts';

// Everything the dashboard only ever reads: the rows are written by the API, the crons and the database triggers.
const READ_ONLY_COLLECTIONS = [ 'gp_credits', 'gp_credits_additions', 'gp_credits_deductions' ];

// Not exposed to the users at all: apps are reached through the applications endpoint.
const CLOSED_COLLECTIONS = [ 'gp_apps', 'gp_apps_approvals' ];

// What the user policy grants on every gp collection, as Directus itself reports it. `partial` means the rows are filtered by a permission rule.
const EXPECTED_ACCESS = {
	gp_probes: { read: 'partial', create: 'none', update: 'partial', delete: 'none', share: 'none' },
	gp_tokens: { read: 'partial', create: 'partial', update: 'partial', delete: 'partial', share: 'none' },
	gp_credits: { read: 'partial', create: 'none', update: 'none', delete: 'none', share: 'none' },
	gp_credits_additions: { read: 'partial', create: 'none', update: 'none', delete: 'none', share: 'none' },
	gp_credits_deductions: { read: 'partial', create: 'none', update: 'none', delete: 'none', share: 'none' },
	gp_accounts: { read: 'partial', create: 'none', update: 'none', delete: 'none', share: 'none' },
	gp_orgs: { read: 'partial', create: 'none', update: 'partial', delete: 'none', share: 'none' },
	gp_org_members: { read: 'partial', create: 'none', update: 'partial', delete: 'none', share: 'none' },
};

// The fields a user can write.
const WRITABLE_FIELDS = {
	'gp_tokens.create': [ 'name', 'value', 'expire', 'origins', 'account_id' ],
	'gp_tokens.update': [ 'name', 'value', 'expire', 'origins' ],
	// PHASE5: `userId` goes away with the column.
	'gp_probes.update': [ 'name', 'tags', 'city', 'userId', 'country', 'state', 'settings', 'account_id' ],
	'gp_orgs.update': [ 'adoption_token', 'public_probes' ],
	'gp_org_members.update': [ 'role', 'notification_preferences' ],
};

const getCollectionAccess = async (api: AxiosInstance) => (await api.get('/permissions/me')).data.data;

test('Directus reports exactly the declared access to the gp collections', async ({ actors }) => {
	for (const api of allUsers(actors)) {
		const access = await getCollectionAccess(api);

		const granted = Object.fromEntries(Object.keys(EXPECTED_ACCESS).map(collection => [
			collection,
			Object.fromEntries(Object.entries(access[collection] ?? {}).map(([ action, rule ]) => [ action, (rule as { access: string }).access ])),
		]));

		expect(granted).toEqual(EXPECTED_ACCESS);

		for (const collection of CLOSED_COLLECTIONS) {
			expect(access[collection]).toBeUndefined();
		}
	}

	// A Directus admin is not restricted by any of it.
	const adminAccess = await getCollectionAccess(actors.directusAdmin);

	for (const collection of [ ...Object.keys(EXPECTED_ACCESS), ...CLOSED_COLLECTIONS ]) {
		expect(adminAccess[collection].create.access).toBe('full');
		expect(adminAccess[collection].delete.access).toBe('full');
	}
});

test('only the declared fields are writable', async ({ actors }) => {
	// The field lists come from the policy, so they are the same for every role; the rows each role reaches are not.
	const access = await getCollectionAccess(actors.member);

	for (const [ key, fields ] of Object.entries(WRITABLE_FIELDS)) {
		const [ collection, action ] = key.split('.');
		expect(access[collection!][action!].fields.sort()).toEqual([ ...fields ].sort());
	}
});

test('the credits collections are read-only for everybody', async ({ org, actors }) => {
	const credits = await sql('gp_credits').insert({ account_id: org.account_id, amount: 1234 });
	const creditsId = credits[0];

	for (const collection of READ_ONLY_COLLECTIONS) {
		for (const api of allUsers(actors)) {
			expect((await api.post(`/items/${collection}`, { amount: 1 })).status).toBe(403);
			expect((await api.patch(`/items/${collection}/${creditsId}`, { amount: 1 })).status).toBe(403);
			expect((await api.delete(`/items/${collection}/${creditsId}`)).status).toBe(403);
		}
	}

	const stored = await sql('gp_credits').where({ id: creditsId }).first('amount');
	expect(stored.amount).toBe(1234);
});

test('the internal collections are not readable and not writable by anybody', async ({ actors }) => {
	for (const collection of CLOSED_COLLECTIONS) {
		for (const api of allUsers(actors)) {
			expect((await api.get(`/items/${collection}`)).status).toBe(403);
			expect((await api.post(`/items/${collection}`, { name: 'e2e' })).status).toBe(403);
		}
	}
});

test('orgs, memberships and probes can not be created or deleted by anybody', async ({ org, actors }) => {
	const probeId = await addProbe({ account_id: org.account_id });
	const membership = await sql('gp_org_members').where({ org: org.id, user: org.member.id }).first('id');

	const rows = [
		{ collection: 'gp_orgs', id: org.id, payload: { name: 'e2e-org' } },
		{ collection: 'gp_org_members', id: membership.id, payload: { org: org.id, user: org.member.id } },
		{ collection: 'gp_probes', id: probeId, payload: { ip: randomIP() } },
	];

	for (const { collection, id, payload } of rows) {
		for (const api of allUsers(actors)) {
			expect((await api.post(`/items/${collection}`, payload)).status).toBe(403);
			expect((await api.delete(`/items/${collection}/${id}`)).status).toBe(403);
		}
	}

	expect(await sql('gp_orgs').where({ id: org.id }).first('id')).toBeTruthy();
	expect(await sql('gp_org_members').where({ id: membership.id }).first('id')).toBeTruthy();
	expect(await sql('gp_probes').where({ id: probeId }).first('id')).toBeTruthy();
});
