import crypto from 'node:crypto';
import axios from 'axios';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { FLOW } from './shared.ts';

const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const CREDITS_PER_DOLLAR = 4000;

type Sponsorship = { login: string; githubId: string; dollars: number; oneTime: boolean };

const sponsorshipEvent = ({ login, githubId, dollars, oneTime }: Sponsorship) => ({
	action: 'created',
	sponsorship: {
		sponsor: { login, id: Number(githubId) },
		tier: { monthly_price_in_dollars: dollars, is_one_time: oneTime, node_id: `tier-${githubId}` },
	},
});

// GitHub signs the raw body, so the request has to carry the very bytes the signature was made over.
const postWebhook = async (event: object, secret = SECRET) => {
	const body = JSON.stringify(event);
	const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf-8').digest('hex');

	return axios.post(`${process.env.DIRECTUS_URL}/flows/trigger/${FLOW.githubWebhook}`, body, {
		headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
		validateStatus: () => true,
	});
};

const additionsFor = async (githubId: string) => {
	const rows = await sql('gp_credits_additions').where({ github_id: githubId }).select('amount', 'reason', 'meta');
	return rows.map(row => ({ ...row, meta: JSON.parse(row.meta) as Record<string, unknown> }));
};

test.afterEach(async ({ org, user }) => {
	await sql('gp_credits_additions').whereIn('github_id', [ org.github_id, user.external_identifier ]).delete();
	await sql('sponsors').whereIn('github_id', [ org.github_id, user.external_identifier ]).delete();
});

test('a one-time sponsorship of an org credits the org account', async ({ org }) => {
	const response = await postWebhook(sponsorshipEvent({ login: org.name, githubId: org.github_id, dollars: 5, oneTime: true }));
	expect(response.status).toBe(200);

	const additions = await additionsFor(org.github_id);
	expect(additions).toHaveLength(1);

	expect(additions[0]).toMatchObject({ amount: 5 * CREDITS_PER_DOLLAR, reason: 'one_time_sponsorship' });
	expect(additions[0].meta).toMatchObject({ amountInDollars: 5 });

	// The addition resolves the github id to an account, so the org gets the balance rather than any of its members.
	const orgCredits = await sql('gp_credits').where({ account_id: org.account_id }).first('amount');
	expect(orgCredits.amount).toBe(5 * CREDITS_PER_DOLLAR);

	// A one-time payment leaves no recurring sponsor behind.
	expect(await sql('sponsors').where({ github_id: org.github_id }).select('id')).toHaveLength(0);
});

test('a recurring sponsorship of a user credits their personal account and records the sponsor', async ({ user }) => {
	const response = await postWebhook(sponsorshipEvent({ login: user.github_username, githubId: user.external_identifier, dollars: 10, oneTime: false }));
	expect(response.status).toBe(200);

	const additions = await additionsFor(user.external_identifier);
	expect(additions).toHaveLength(1);
	expect(additions[0]).toMatchObject({ amount: 10 * CREDITS_PER_DOLLAR, reason: 'recurring_sponsorship' });

	const credits = await sql('gp_credits').where({ account_id: user.account_id }).first('amount');
	expect(credits.amount).toBe(10 * CREDITS_PER_DOLLAR);

	const sponsor = await sql('sponsors').where({ github_id: user.external_identifier }).first('github_login', 'monthly_amount');
	expect(sponsor).toMatchObject({ github_login: user.github_username, monthly_amount: 10 });
});

test('a sponsorship of a github account nobody claimed yet is kept unconsumed', async ({ org }) => {
	const unknownGithubId = `9${org.github_id}`;

	try {
		const response = await postWebhook(sponsorshipEvent({ login: 'e2e-stranger', githubId: unknownGithubId, dollars: 3, oneTime: true }));
		expect(response.status).toBe(200);

		// Nothing owns that github id, so the trigger leaves the addition for whoever claims it later.
		const addition = await sql('gp_credits_additions').where({ github_id: unknownGithubId }).first('consumed', 'amount');
		expect(addition).toMatchObject({ consumed: 0, amount: 3 * CREDITS_PER_DOLLAR });
	} finally {
		await sql('gp_credits_additions').where({ github_id: unknownGithubId }).delete();
		await sql('sponsors').where({ github_id: unknownGithubId }).delete();
	}
});

test('a request that is not signed with the shared secret is refused', async ({ org }) => {
	const response = await postWebhook(sponsorshipEvent({ login: org.name, githubId: org.github_id, dollars: 5, oneTime: true }), 'wrong-secret');

	// A flow answers 200 with an empty body whatever its operation did, so the refusal only shows in what was not written.
	expect(response.status).toBe(200);
	expect(await additionsFor(org.github_id)).toHaveLength(0);
	expect(await sql('gp_credits').where({ account_id: org.account_id }).select('id')).toHaveLength(0);
});
