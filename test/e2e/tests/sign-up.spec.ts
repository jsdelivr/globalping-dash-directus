import { setTimeout } from 'node:timers/promises';
import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { loginDirectusAdmin } from '../utils.ts';

// Directus maps the GitHub login into `last_name` (AUTH_GITHUB_LAST_NAME_KEY), which the sign-up filter turns into
// github_username and default_prefix - so creating the user with `last_name` mirrors the real OAuth sign-up.
const createGithubUser = async (githubId: string, token: string, login: string) => {
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, {
		token,
		username: login,
		githubId: Number(githubId),
		memberships: [],
		orgs: [],
	});

	const role = await sql('directus_roles').where({ name: 'User' }).first('id') as { id: string };
	const admin = await loginDirectusAdmin();

	const response = await admin.post('/users', {
		provider: 'github',
		external_identifier: githubId,
		github_oauth_token: token,
		last_name: login,
		email: `${login}@example.com`,
		role: role.id,
	});

	expect(response.status).toBe(200);
	return response.data.data.id as string;
};

const waitForCredits = async (userId: string) => {
	for (let attempt = 0; attempt < 50; attempt++) {
		// PHASE5: user_id is dropped, switch this poll to account_id. We poll the legacy column on purpose:
		// user_id is always written, so a null account_id shows up as a clear assertion failure, not a timeout.
		const row = await sql('gp_credits').where({ user_id: userId }).first('account_id', 'amount') as { account_id: string | null; amount: number } | undefined;

		if (row) {
			return row;
		}

		await setTimeout(100);
	}

	throw new Error(`No gp_credits row for ${userId}.`);
};

test('a new GitHub user gets their pending credits on the account', async () => {
	const githubId = String(Math.floor(Math.random() * 1_000_000_000));
	const token = `e2e-signup-${githubId}`;
	const login = `e2e-signup-${githubId}`;

	// A sponsorship that arrived before the user existed: the trigger leaves it unconsumed with no gp_credits row.
	await sql('gp_credits_additions').insert({
		github_id: githubId,
		amount: 12345,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({ amountInDollars: 30 }),
		consumed: 0,
	});

	const userId = await createGithubUser(githubId, token, login);

	const account = await sql('gp_accounts').where({ user: userId }).first('id') as { id: string };
	const credits = await waitForCredits(userId);

	expect(credits.account_id).toBe(account.id);
	expect(credits.amount).toBe(12345);

	await sql('gp_credits').where({ account_id: account.id }).delete();
	await sql('gp_accounts').where({ user: userId }).delete();
	await sql('gp_credits_additions').where({ github_id: githubId }).delete();
	await sql('directus_users').where({ id: userId }).delete();
});
