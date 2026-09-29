import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';

const addApp = async (userId: string) => {
	const id = randomUUID();

	await sql('gp_apps').insert({
		id,
		user_created: userId,
		name: 'e2e-app',
		secrets: JSON.stringify([]),
		grants: JSON.stringify([ 'authorization_code' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	});

	return id;
};

test('An account belongs either to a user or to an org, never to both and never to neither', async ({ user, org }) => {
	await expect(sql('gp_accounts').insert({ id: randomUUID(), user: user.id, org: org.id })).rejects.toThrow(/CONSTRAINT/);
	await expect(sql('gp_accounts').insert({ id: randomUUID() })).rejects.toThrow(/CONSTRAINT/);
});

test('A user is a member of an org only once', async ({ org }) => {
	await expect(sql('gp_org_members').insert({ id: randomUUID(), org: org.id, user: org.member.id, role: 'viewer' })).rejects.toThrow(/Duplicate/);
});

test('An account has a single credits row', async ({ user }) => {
	await sql('gp_credits').insert({ account_id: user.account_id, user_id: user.id, amount: 1000 });

	await expect(sql('gp_credits').insert({ account_id: user.account_id, amount: 500 })).rejects.toThrow(/Duplicate/);
});

test('An account is charged once per day', async ({ user, org }) => {
	const date = '2026-01-01';
	await sql('gp_credits_deductions').insert({ account_id: user.account_id, user_id: user.id, amount: 100, date });

	await expect(sql('gp_credits_deductions').insert({ account_id: user.account_id, amount: 200, date })).rejects.toThrow(/Duplicate/);

	// The same day of another account is a different row.
	await sql('gp_credits_deductions').insert({ account_id: org.account_id, amount: 200, date });
	const deductions = await sql('gp_credits_deductions').whereIn('account_id', [ user.account_id, org.account_id ]).select('id');
	expect(deductions).toHaveLength(2);
});

test('An app is approved once per account', async ({ user, org }) => {
	const app = await addApp(user.id);

	await sql('gp_apps_approvals').insert({ id: randomUUID(), user_created: user.id, account_id: user.account_id, app, scopes: JSON.stringify([ 'measurements' ]) });

	await expect(sql('gp_apps_approvals').insert({
		id: randomUUID(),
		user_created: user.id,
		account_id: user.account_id,
		app,
		scopes: JSON.stringify([ 'measurements' ]),
	})).rejects.toThrow(/Duplicate/);

	// The same app approved for the org the user belongs to is a different row.
	await sql('gp_apps_approvals').insert({ id: randomUUID(), user_created: user.id, account_id: org.account_id, app, scopes: JSON.stringify([ 'measurements' ]) });
	const approvals = await sql('gp_apps_approvals').where({ user_created: user.id }).select('id');
	expect(approvals).toHaveLength(2);
});
