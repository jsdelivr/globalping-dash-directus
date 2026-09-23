import axios from 'axios';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { FLOW, trigger } from './shared.ts';

const CREDITS_PER_DOLLAR = 4000;

type MockSponsor = { login: string; githubId: number; monthlyAmount: number; isActive?: boolean; isOneTimePayment?: boolean };

const mockGithubSponsors = async (own: MockSponsor[], goneGithubIds: string[] = [], activities: object[] = []) => {
	await sql('sponsors').update({ last_earning_date: new Date() });
	const stored = await sql('sponsors').select('github_id', 'github_login', 'monthly_amount');

	const ownGithubIds = own.map(sponsor => sponsor.githubId.toString());

	const existing = stored
		.filter(sponsor => !goneGithubIds.includes(sponsor.github_id) && !ownGithubIds.includes(sponsor.github_id))
		.map(sponsor => ({ login: sponsor.github_login, githubId: Number(sponsor.github_id), monthlyAmount: sponsor.monthly_amount }));

	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/sponsors/state`, { sponsors: [ ...existing, ...own ], activities });
};

const additionsFor = (githubId: string) => sql('gp_credits_additions').where({ github_id: githubId }).select('amount', 'reason');

test.afterEach(async ({ org, user }) => {
	await sql('gp_credits_additions').whereIn('github_id', [ org.github_id, user.external_identifier ]).delete();
	await sql('sponsors').whereIn('github_id', [ org.github_id, user.external_identifier ]).delete();
});

test('records a new org sponsor and credits the org account', async ({ org }) => {
	await mockGithubSponsors([{ login: org.name, githubId: Number(org.github_id), monthlyAmount: 5 }]);

	await trigger(FLOW.sponsors);

	const sponsor = await sql('sponsors').where({ github_id: org.github_id }).first('github_login', 'monthly_amount');
	expect(sponsor).toMatchObject({ github_login: org.name, monthly_amount: 5 });

	const additions = await additionsFor(org.github_id);
	expect(additions).toHaveLength(1);
	expect(additions[0]).toMatchObject({ amount: 5 * CREDITS_PER_DOLLAR, reason: 'recurring_sponsorship' });

	// The github id resolves to the org's account, so the balance is the org's and not any member's.
	const orgCredits = await sql('gp_credits').where({ account_id: org.account_id }).first('amount');
	expect(orgCredits.amount).toBe(5 * CREDITS_PER_DOLLAR);
});

test('records a new personal sponsor and credits their own account', async ({ user }) => {
	await mockGithubSponsors([{ login: user.github_username, githubId: Number(user.external_identifier), monthlyAmount: 2 }]);

	await trigger(FLOW.sponsors);

	const sponsor = await sql('sponsors').where({ github_id: user.external_identifier }).first('monthly_amount');
	expect(sponsor).toMatchObject({ monthly_amount: 2 });

	const credits = await sql('gp_credits').where({ account_id: user.account_id }).first('amount');
	expect(credits.amount).toBe(2 * CREDITS_PER_DOLLAR);
});

test('drops a sponsor that is gone from GitHub and keeps the rest', async ({ org, user }) => {
	await sql('sponsors').insert([
		{ github_id: org.github_id, github_login: org.name, monthly_amount: 5, last_earning_date: new Date() },
		{ github_id: user.external_identifier, github_login: user.github_username, monthly_amount: 5, last_earning_date: new Date() },
	]);

	await mockGithubSponsors([], [ org.github_id ]);

	await trigger(FLOW.sponsors);

	expect(await sql('sponsors').where({ github_id: org.github_id }).select('id')).toHaveLength(0);
	expect(await sql('sponsors').where({ github_id: user.external_identifier }).select('id')).toHaveLength(1);
});

test('drops a sponsor whose sponsorship turned one-time, without crediting them again', async ({ org }) => {
	await sql('sponsors').insert({ github_id: org.github_id, github_login: org.name, monthly_amount: 5, last_earning_date: new Date() });

	await mockGithubSponsors([{ login: org.name, githubId: Number(org.github_id), monthlyAmount: 5, isOneTimePayment: true }]);

	await trigger(FLOW.sponsors);

	expect(await sql('sponsors').where({ github_id: org.github_id }).select('id')).toHaveLength(0);
	expect(await additionsFor(org.github_id)).toHaveLength(0);
});

test('credits a redirected sponsor', async ({ org, user }) => {
	// A pair seeded into gp_credits_redirects: an org that sponsors, and the user its credits belong to.
	org.github_id = '203478287';
	user.external_identifier = '163146';
	await sql('sponsors').where({ github_id: org.github_id }).delete();
	await sql('gp_credits_additions').where({ github_id: user.external_identifier }).delete();
	await sql('gp_orgs').where({ id: org.id }).update({ github_id: org.github_id });
	await sql('directus_users').where({ id: user.id }).update({ external_identifier: user.external_identifier });

	await mockGithubSponsors([], [], [{
		id: 'e2e-activity',
		action: 'NEW_SPONSORSHIP',
		timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
		sponsor: { databaseId: Number(org.github_id), login: org.name },
		sponsorsTier: { id: `tier-${org.github_id}`, monthlyPriceInDollars: 5, isOneTime: true },
		previousSponsorsTier: null,
	}]);

	await trigger(FLOW.sponsors);

	expect(await additionsFor(org.github_id)).toHaveLength(0);
	expect(await additionsFor(user.external_identifier)).toMatchObject([{ amount: 5 * CREDITS_PER_DOLLAR, reason: 'one_time_sponsorship' }]);

	await trigger(FLOW.sponsors);

	expect(await additionsFor(user.external_identifier)).toHaveLength(1);

	const userCredits = await sql('gp_credits').where({ account_id: user.account_id }).first('amount');
	expect(userCredits.amount).toBe(5 * CREDITS_PER_DOLLAR);
	expect(await sql('gp_credits').where({ account_id: org.account_id }).select('id')).toHaveLength(0);
});
