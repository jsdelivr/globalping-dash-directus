import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { addProbe, randomToken } from '../../utils.ts';

const orgIds: string[] = [];
const githubIds: string[] = [];

const randomGithubId = () => {
	const id = Math.floor(Math.random() * 10000000).toString();
	githubIds.push(id);
	return id;
};

const addOrg = async (githubId = randomGithubId()) => {
	const id = randomUUID();

	await sql('gp_orgs').insert({
		id,
		name: `e2e-org-${id.split('-')[0]}`,
		github_id: githubId,
		adoption_token: randomUUID(),
	});

	orgIds.push(id);
	const account = await sql('gp_accounts').where({ org: id }).first('id');
	return { id, accountId: account.id as string };
};

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

const addSponsorship = async (githubId: string, amount: number) => {
	await sql('gp_credits_additions').insert({
		github_id: githubId,
		amount,
		consumed: 0,
		date_created: new Date(),
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({ amountInDollars: amount / 200 }),
	});
};

test.afterEach(async () => {
	await sql('gp_orgs').whereIn('id', orgIds).delete();
	await sql('gp_credits_additions').whereIn('github_id', githubIds).delete();
	orgIds.length = 0;
	githubIds.length = 0;
});

test('An account is created for every user and for every org', async ({ user, org }) => {
	const forUser = await sql('gp_accounts').where({ user: user.id }).first('id', 'org');
	expect(forUser.id).toBe(user.account_id);
	expect(forUser.org).toBe(null);

	const forOrg = await sql('gp_accounts').where({ org: org.id }).first('id', 'user');
	expect(forOrg.id).toBe(org.account_id);
	expect(forOrg.user).toBe(null);
});

test('A new org claims the sponsorship credits that were waiting for its GitHub id', async () => {
	const githubId = randomGithubId();
	await addSponsorship(githubId, 1000);
	await addSponsorship(githubId, 500);

	const org = await addOrg(githubId);

	const unclaimed = await sql('gp_credits_additions').where({ github_id: githubId, consumed: 0 }).select('id');
	expect(unclaimed).toHaveLength(0);

	const credits = await sql('gp_credits').where({ account_id: org.accountId }).first('amount');
	expect(Number(credits.amount)).toBe(1500);
});

// PHASE5: remove together with the fulfilling triggers.
test('A token written with the legacy user column alone lands on the personal account', async ({ user }) => {
	const [ id ] = await sql('gp_tokens').insert({
		name: 'e2e-legacy-token',
		value: randomToken(),
		origins: JSON.stringify([]),
		user_created: user.id,
	});

	const token = await sql('gp_tokens').where({ id }).first('account_id');
	expect(token.account_id).toBe(user.account_id);
});

// PHASE5: remove together with the fulfilling triggers.
test('An app approval is completed from whichever user column it was written with', async ({ user }) => {
	const app = await addApp(user.id);
	const otherApp = await addApp(user.id);

	const byUser = randomUUID();
	await sql('gp_apps_approvals').insert({ id: byUser, user: user.id, app, scopes: JSON.stringify([ 'measurements' ]) });

	const fromUser = await sql('gp_apps_approvals').where({ id: byUser }).first('user_created', 'account_id');
	expect(fromUser.user_created).toBe(user.id);
	expect(fromUser.account_id).toBe(user.account_id);

	const byUserCreated = randomUUID();
	await sql('gp_apps_approvals').insert({ id: byUserCreated, user_created: user.id, app: otherApp, scopes: JSON.stringify([ 'measurements' ]) });

	const fromUserCreated = await sql('gp_apps_approvals').where({ id: byUserCreated }).first('user', 'account_id');
	expect(fromUserCreated.user).toBe(user.id);
	expect(fromUserCreated.account_id).toBe(user.account_id);
});

test('A credits addition lands on the account of its GitHub id', async ({ user, org }) => {
	await addSponsorship(user.external_identifier, 300);
	githubIds.push(user.external_identifier);

	const personal = await sql('gp_credits').where({ account_id: user.account_id }).first('amount');
	expect(Number(personal.amount)).toBe(300);

	await addSponsorship(org.github_id, 700);
	githubIds.push(org.github_id);

	const forOrg = await sql('gp_credits').where({ account_id: org.account_id }).first('amount');
	expect(Number(forOrg.amount)).toBe(700);
});

test('A credits addition for a GitHub id nobody owns waits unconsumed', async () => {
	const githubId = randomGithubId();
	await addSponsorship(githubId, 1000);

	const addition = await sql('gp_credits_additions').where({ github_id: githubId }).first('consumed');
	expect(Boolean(addition.consumed)).toBe(false);
});

test('A decrease of the balance is written as a deduction of the same account, once a day', async ({ user }) => {
	await sql('gp_credits').insert({ account_id: user.account_id, user_id: user.id, amount: 1000 });

	await sql('gp_credits').where({ account_id: user.account_id }).update({ amount: 700 });
	await sql('gp_credits').where({ account_id: user.account_id }).update({ amount: 500 });

	// The two decreases of the same day accumulate in a single row.
	const deductions = await sql('gp_credits_deductions').where({ account_id: user.account_id }).select('amount', 'user_id');
	expect(deductions).toHaveLength(1);
	expect(Number(deductions[0].amount)).toBe(500);
	expect(deductions[0].user_id).toBe(user.id);
});

test('The search index of a probe carries the name of its owner', async ({ user, org }) => {
	const personalProbe = await addProbe({ account_id: user.account_id, userId: user.id });
	const orgProbe = await addProbe({ account_id: org.account_id });

	// The whole index is lowercased by the function that builds it.
	const personal = await sql('gp_probes').where({ id: personalProbe }).first('searchIndex');
	expect(personal.searchIndex).toContain(`u-${user.github_username.toLowerCase()}`);

	const forOrg = await sql('gp_probes').where({ id: orgProbe }).first('searchIndex');
	expect(forOrg.searchIndex).toContain(`u-${org.name.toLowerCase()}`);
});
