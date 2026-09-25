import { randomUUID } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { Org, User } from '../types.ts';
import { addApplication, addProbe, loginUser } from '../utils.ts';

const emptyTheOrg = (org: Org) => sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({ role: 'member' });

const roleOf = async (org: Org, user: User) => {
	const membership = await sql('gp_org_members').where({ org: org.id, user: user.id }).first('role');
	return membership.role as string;
};

const creditsOf = async (accountId: string) => {
	const row = await sql('gp_credits').where({ account_id: accountId }).first('amount');
	return row?.amount as number | undefined;
};

const transfer = (api: AxiosInstance, what: string, orgId: string) => api.post(`/transfer-data/${what}`, { orgId });

test('a member of an org with no admin can move probes, tokens and credits, and becomes an admin', async ({ org, actors }) => {
	await emptyTheOrg(org);

	const probeId = await addProbe({ userId: org.member.id, account_id: org.member.account_id });
	await addApplication({ accountId: org.member.account_id, userId: org.member.id });
	await sql('gp_credits').insert({ account_id: org.member.account_id, amount: 500 });

	for (const what of [ 'credits', 'tokens', 'probes' ]) {
		expect((await transfer(actors.member, what, org.id)).status, what).toBe(200);
	}

	expect(await roleOf(org, org.member)).toBe('admin');
	expect(await creditsOf(org.account_id)).toBe(500);
	expect(await creditsOf(org.member.account_id)).toBeUndefined();

	const probe = await sql('gp_probes').where({ id: probeId }).first('account_id', 'userId');
	expect(probe.account_id).toBe(org.account_id);

	// The probe keeps its user: the phase 2 readers resolve the owner through the account.
	expect(probe.userId).toBe(org.member.id);

	expect(await sql('gp_tokens').where({ account_id: org.member.account_id }).select('id')).toHaveLength(0);
	expect((await sql('gp_tokens').where({ account_id: org.account_id }).select('id')).length).toBeGreaterThan(0);

	// The probes report the member's adoption token, so it moves with them and the member gets a fresh one.
	const orgRow = await sql('gp_orgs').where({ id: org.id }).first('extra_adoption_tokens');
	expect(JSON.parse(orgRow.extra_adoption_tokens)).toEqual([{ github_username: org.member.github_username, token: org.member.adoption_token }]);

	const memberRow = await sql('directus_users').where({ id: org.member.id }).first('adoption_token');
	expect(memberRow.adoption_token).not.toBe(org.member.adoption_token);
	expect(memberRow.adoption_token).toHaveLength(32);
});

test('the user credits are added to the org credits, and the user credits row is deleted', async ({ org, actors }) => {
	await emptyTheOrg(org);

	// An addition credits the balance through a trigger, so it goes in first and the amounts are set on top of what it left.
	await sql('gp_credits_additions').insert({ github_id: org.member.external_identifier, amount: 100, reason: 'one_time_sponsorship', meta: JSON.stringify({ amountInDollars: 1 }), date_created: new Date() });

	await sql('gp_credits').where({ account_id: org.member.account_id }).update({ amount: 500 });
	await sql('gp_credits').insert({ account_id: org.account_id, amount: 70 });

	await sql('gp_credits_deductions').insert([
		{ account_id: org.member.account_id, date: '2026-09-01', amount: 10 },
		{ account_id: org.member.account_id, date: '2026-09-02', amount: 20 },
		{ account_id: org.account_id, date: '2026-09-02', amount: 5 },
	]);

	expect((await transfer(actors.member, 'credits', org.id)).status).toBe(200);

	expect(await creditsOf(org.account_id)).toBe(570);
	expect(await creditsOf(org.member.account_id)).toBeUndefined();

	const deductions = await sql('gp_credits_deductions').where({ account_id: org.account_id }).orderBy('date').select('date', 'amount');
	expect(deductions.map(row => row.amount)).toEqual([ 10, 25 ]);

	// A drop in the balance is recorded as a deduction, so deleting rather than zeroing is what keeps today clean.
	expect(deductions).toHaveLength(2);

	// The history follows the github id, which is also what carries the sponsorship bonus.
	expect(await sql('gp_credits_additions').where({ github_id: org.member.external_identifier }).select('id')).toHaveLength(0);
	expect(await sql('gp_credits_additions').where({ github_id: org.github_id }).select('id')).toHaveLength(1);
});

test('when the same app is approved in both accounts, the org approval is kept and the user approval is deleted', async ({ org, actors }) => {
	await emptyTheOrg(org);

	const app = await addApplication({ accountId: org.member.account_id, userId: org.member.id });
	await addApplication({ accountId: org.account_id, userId: org.member.id, appId: app });

	await sql('gp_apps_approvals').where({ user_created: org.member.id, account_id: org.member.account_id }).update({ scopes: JSON.stringify([ 'measurements' ]) });
	await sql('gp_apps_approvals').where({ user_created: org.member.id, account_id: org.account_id }).update({ scopes: JSON.stringify([ 'profile' ]) });

	expect((await transfer(actors.member, 'tokens', org.id)).status).toBe(200);

	const approvals = await sql('gp_apps_approvals').where({ user_created: org.member.id }).select('account_id', 'scopes');
	expect(approvals).toHaveLength(1);
	expect(approvals[0].account_id).toBe(org.account_id);

	// Moving tokens is nobody answering a consent screen, so what the org agreed to is left as it was.
	expect(JSON.parse(approvals[0].scopes)).toEqual([ 'profile' ]);
});

test('a member can not move probes when the org already has an admin, but can move tokens and credits', async ({ org, actors }) => {
	await sql('gp_credits').insert({ account_id: org.member.account_id, amount: 500 });

	const refused = await transfer(actors.member, 'probes', org.id);
	expect(refused.status).toBe(403);
	expect(refused.data).toContain('no admin yet');

	expect((await transfer(actors.member, 'credits', org.id)).status).toBe(200);
	expect((await transfer(actors.member, 'tokens', org.id)).status).toBe(200);

	// Nothing was granted, so the role is untouched.
	expect(await roleOf(org, org.member)).toBe('member');

	// Where the org's money goes says nothing about who may act for it, so a redirect does not open the gate either.
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	try {
		expect((await transfer(actors.member, 'probes', org.id)).status).toBe(403);
	} finally {
		await sql('gp_credits_redirects').where({ source_github_id: org.github_id }).delete();
	}
});

test('a viewer, a user from another org and an unknown org are rejected', async ({ org, org2, actors }) => {
	for (const what of [ 'probes', 'tokens', 'credits' ]) {
		const asViewer = await transfer(actors.viewer, what, org.id);
		expect(asViewer.status, what).toBe(403);
		expect(asViewer.data).toBe('Viewers can not transfer anything to an organization.');

		const asOutsider = await transfer(actors.outsider, what, org.id);
		expect(asOutsider.status, what).toBe(403);
		expect(asOutsider.data).toBe('You are not a member of this organization.');

		// Another org's admin is an outsider here.
		expect((await transfer(actors.otherOrgAdmin, what, org.id)).status, what).toBe(403);
		expect((await transfer(actors.admin, what, org2.id)).status, what).toBe(403);
	}

	const unknown = await transfer(actors.admin, 'credits', randomUUID());
	expect(unknown.status).toBe(400);
	expect(unknown.data).toBe('Organization not found.');
});

test('a user can create a redirect to an org, and both the user and the org can delete it', async ({ org, org2, actors }) => {
	const redirects = async (api: AxiosInstance, accountId: string) => (await api.get(`/transfer-data/credits-redirect?accountId=${accountId}`)).data.redirects;
	const remove = (api: AxiosInstance, accountId: string, source: string, target: string) => api.delete('/transfer-data/credits-redirect', { data: { accountId, source, target } });

	expect(await redirects(actors.member, org.member.account_id)).toEqual([]);

	expect((await actors.member.post('/transfer-data/credits-redirect', { accountId: org.member.account_id, orgId: org.id })).status).toBe(200);

	// Each side comes back named: the dash shows "john => acme-org" and can read no other user's row.
	expect(await redirects(actors.member, org.member.account_id)).toEqual([{
		source: { githubId: org.member.external_identifier, name: org.member.github_username },
		target: { githubId: org.github_id, name: org.name },
	}]);

	// The counterparty of an org's redirect is a person no other row a member can read names.
	expect(await redirects(actors.admin, org.account_id)).toHaveLength(1);

	for (const api of [ actors.member, actors.viewer ]) {
		expect((await api.get(`/transfer-data/credits-redirect?accountId=${org.account_id}`)).status).toBe(400);
	}

	// An org receives a sponsorship, it does not pass one on.
	const pointed = await actors.admin.post('/transfer-data/credits-redirect', { accountId: org.account_id, orgId: org.id });
	expect(pointed.status).toBe(400);
	expect(pointed.data).toBe('An organization can not redirect credits, only user can.');

	// The org the sponsorship arrives at may refuse it.
	expect((await remove(actors.admin, org.account_id, org.member.external_identifier, org.github_id)).status).toBe(200);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.member.external_identifier }).select('id')).toHaveLength(0);

	// And the user may take it back themselves.
	expect((await actors.member.post('/transfer-data/credits-redirect', { accountId: org.member.account_id, orgId: org.id })).status).toBe(200);
	expect((await remove(actors.member, org.member.account_id, org.member.external_identifier, org.github_id)).status).toBe(200);
	expect(await sql('gp_credits_redirects').where({ source_github_id: org.member.external_identifier }).select('id')).toHaveLength(0);

	// Nobody outside the two sides of a row may end it.
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org2.github_id, target_github_id: org2.member.external_identifier });

	try {
		const foreign = await remove(actors.member, org.member.account_id, org2.github_id, org2.member.external_identifier);
		expect(foreign.status).toBe(403);
		expect(foreign.data).toBe('A redirect can only be removed by one of its two sides.');
	} finally {
		await sql('gp_credits_redirects').where({ source_github_id: org2.github_id }).delete();
	}
});

test('a user can delete a redirect from an org to them, and creating their own redirect deletes it too', async ({ org, org2, actors }) => {
	const incoming = () => sql('gp_credits_redirects').where({ source_github_id: org.github_id, target_github_id: org.member.external_identifier }).select('id');

	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	expect((await actors.member.delete('/transfer-data/credits-redirect', { data: { accountId: org.member.account_id, source: org.github_id, target: org.member.external_identifier } })).status).toBe(200);
	expect(await incoming()).toHaveLength(0);

	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier });

	// Sending their own sponsorship somewhere says they are nobody's stand-in any more, whichever org they pick.
	expect((await actors.member.post('/transfer-data/credits-redirect', { accountId: org.member.account_id, orgId: org2.id })).status).toBe(403);
	expect((await actors.member.post('/transfer-data/credits-redirect', { accountId: org.member.account_id, orgId: org.id })).status).toBe(200);
	expect(await incoming()).toHaveLength(0);

	await sql('gp_credits_redirects').where({ source_github_id: org.member.external_identifier }).delete();
});

test('moving credits does not delete any redirect', async ({ org, org2, actors }) => {
	await emptyTheOrg(org);

	await sql('gp_credits_redirects').insert([
		{ id: randomUUID(), source_github_id: org.github_id, target_github_id: org.member.external_identifier },
		{ id: randomUUID(), source_github_id: org2.github_id, target_github_id: org.member.external_identifier },
	]);

	try {
		expect((await transfer(actors.member, 'credits', org.id)).status).toBe(200);

		// Where the money already is and where the next of it goes are separate decisions, and the rows belong to the orgs.
		expect(await sql('gp_credits_redirects').whereIn('source_github_id', [ org.github_id, org2.github_id ]).select('id')).toHaveLength(2);
	} finally {
		await sql('gp_credits_redirects').whereIn('source_github_id', [ org.github_id, org2.github_id ]).delete();
	}
});

test('a viewer does not become an admin of an org with no admin', async ({ org }) => {
	await emptyTheOrg(org);

	const viewer = await loginUser(org.viewer);
	const refused = await transfer(viewer, 'credits', org.id);

	expect(refused.status).toBe(403);
	expect(await roleOf(org, org.viewer)).toBe('viewer');
});

test('a user with no probes keeps their adoption token, even after several probe transfers', async ({ org, actors }) => {
	await emptyTheOrg(org);

	for (const attempt of [ 1, 2, 3 ]) {
		expect((await transfer(actors.member, 'probes', org.id)).status, `attempt ${attempt}`).toBe(200);
	}

	// Without probes the org has no use for the token, and handing it over anyway would add an entry per call.
	const orgRow = await sql('gp_orgs').where({ id: org.id }).first('extra_adoption_tokens');
	expect(JSON.parse(orgRow.extra_adoption_tokens)).toEqual([]);

	const memberRow = await sql('directus_users').where({ id: org.member.id }).first('adoption_token');
	expect(memberRow.adoption_token).toBe(org.member.adoption_token);
});

test('two members can move probes to the same org, and both adoption tokens stay in the list', async ({ org, actors }) => {
	await emptyTheOrg(org);
	await addProbe({ userId: org.member.id, account_id: org.member.account_id });
	await addProbe({ userId: org.admin.id, account_id: org.admin.account_id });

	expect((await transfer(actors.member, 'probes', org.id)).status).toBe(200);

	// The first transfer made the member the admin, so the second mover has to be one too.
	await sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({ role: 'admin' });
	expect((await transfer(actors.admin, 'probes', org.id)).status).toBe(200);

	const orgRow = await sql('gp_orgs').where({ id: org.id }).first('extra_adoption_tokens');
	const tokens = JSON.parse(orgRow.extra_adoption_tokens);
	expect(tokens).toHaveLength(2);

	// The list is what phase 4 removes entries from, so every entry it receives has to pass the update hook.
	const kept = await actors.member.patch(`/items/gp_orgs/${org.id}`, { extra_adoption_tokens: [ tokens[0] ] });
	expect(kept.status).toBe(200);
});

test('when a transfer fails, nothing is moved and the user does not become an admin', async ({ org, actors }) => {
	await emptyTheOrg(org);

	const probeId = await addProbe({ userId: org.member.id, account_id: org.member.account_id });
	// Valid JSON that is not a list, so the transfer throws after the probes have already moved inside the transaction.
	await sql('gp_orgs').where({ id: org.id }).update({ extra_adoption_tokens: '{}' });

	expect((await transfer(actors.member, 'probes', org.id)).status).toBe(500);

	const probe = await sql('gp_probes').where({ id: probeId }).first('account_id');
	expect(probe.account_id).toBe(org.member.account_id);
	expect(await roleOf(org, org.member)).toBe('member');

	const memberRow = await sql('directus_users').where({ id: org.member.id }).first('adoption_token');
	expect(memberRow.adoption_token).toBe(org.member.adoption_token);
});
