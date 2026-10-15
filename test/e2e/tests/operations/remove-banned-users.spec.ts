import axios from 'axios';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { FLOW, trigger } from './shared.ts';

const OPS_TOKEN = process.env.GITHUB_ACCESS_TOKEN ?? '';

// The cron walks every user, so anyone the mock does not know is treated as banned. The mock resolves a login by
// scanning all the states it holds, which is why each surviving user is registered under a key of their own.
const mockGithubUsersExcept = async (goneLogins: string[]) => {
	const users = await sql('directus_users').whereNotNull('github_username').select('github_username', 'external_identifier');
	const surviving = users.filter(user => !goneLogins.includes(user.github_username));

	// The ops token itself needs a state, otherwise the mock proxies the request to the real GitHub.
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, { token: OPS_TOKEN, username: 'e2e-ops', githubId: 0 });

	await Promise.all(surviving.map(user => axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, {
		token: `e2e-exists-${user.external_identifier}`,
		username: user.github_username,
		githubId: Number(user.external_identifier),
	})));
};

const statusOf = async (userId: string) => {
	const row = await sql('directus_users').where({ id: userId }).first('status');
	return row?.status ?? null;
};

test('suspends a user who is gone from GitHub and leaves the others alone', async ({ user, user2 }) => {
	await mockGithubUsersExcept([ user2.github_username ]);

	await trigger(FLOW.removeBannedUsers);

	expect(await statusOf(user2.id)).toBe('suspended');
	expect(await statusOf(user.id)).toBe('active');
});

test('restores a suspended user who is back on GitHub', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({ status: 'suspended', suspended_at: relativeDayUtc(-10) });
	await mockGithubUsersExcept([]);

	await trigger(FLOW.removeBannedUsers);

	expect(await statusOf(user.id)).toBe('active');
});

test('deletes a member suspended over a year ago, and the org loses the membership with them', async ({ org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ status: 'suspended', suspended_at: relativeDayUtc(-400) });
	await mockGithubUsersExcept([ org.member.github_username ]);

	expect(await sql('gp_org_members').where({ org: org.id, user: org.member.id }).select('id')).toHaveLength(1);

	await trigger(FLOW.removeBannedUsers);

	expect(await statusOf(org.member.id)).toBe(null);

	// The membership and the personal account go with the user; the org and its own account stay.
	expect(await sql('gp_org_members').where({ org: org.id, user: org.member.id }).select('id')).toHaveLength(0);
	expect(await sql('gp_accounts').where({ user: org.member.id }).select('id')).toHaveLength(0);
	expect(await sql('gp_accounts').where({ id: org.account_id }).select('id')).toHaveLength(1);
});

test('keeps a user suspended when the year is not over yet', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({ status: 'suspended', suspended_at: relativeDayUtc(-300) });
	await mockGithubUsersExcept([ user.github_username ]);

	await trigger(FLOW.removeBannedUsers);

	expect(await statusOf(user.id)).toBe('suspended');
});
