import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const setDefaultAccount = (api: AxiosInstance, accountId: string | null) => api.patch('/users/me', { default_account: accountId });

const defaultAccountOf = async (userId: string) => (await sql('directus_users').where({ id: userId }).first('default_account')).default_account as string | null;

test('a user can make their own account or the account of an org they are in the default one', async ({ org, actors }) => {
	expect(await defaultAccountOf(org.member.id)).toBeNull();

	expect((await setDefaultAccount(actors.member, org.member.account_id)).status).toBe(200);
	expect(await defaultAccountOf(org.member.id)).toBe(org.member.account_id);

	for (const role of [ 'admin', 'member', 'viewer' ] as const) {
		expect((await setDefaultAccount(actors[role], org.account_id)).status, role).toBe(200);
		expect(await defaultAccountOf(org[role].id), role).toBe(org.account_id);
	}

	expect((await setDefaultAccount(actors.member, null)).status).toBe(200);
	expect(await defaultAccountOf(org.member.id)).toBeNull();
});

test('a user can not make the default account an org they are not in or another user\'s account', async ({ org, org2, user, actors }) => {
	const attempts = [
		{ api: actors.member, userId: org.member.id, accountId: org2.account_id },
		{ api: actors.member, userId: org.member.id, accountId: org.admin.account_id },
		{ api: actors.outsider, userId: user.id, accountId: org.account_id },
	];

	for (const { api, userId, accountId } of attempts) {
		for (const request of [
			() => setDefaultAccount(api, accountId),
			() => api.patch(`/users/${userId}`, { default_account: accountId }),
			() => api.patch('/users', { keys: [ userId ], data: { default_account: accountId } }),
		]) {
			const response = await request();
			expect(response.status).toBe(400);
			expect(response.data.errors[0].extensions.field).toBe('default_account');
		}

		expect(await defaultAccountOf(userId)).toBeNull();
	}
});

test('the default account is left alone by the other settings and is cleared with the org', async ({ org, actors }) => {
	await setDefaultAccount(actors.member, org.account_id);
	expect((await actors.member.patch('/users/me', { public_probes: true })).status).toBe(200);
	expect(await defaultAccountOf(org.member.id)).toBe(org.account_id);

	await sql('gp_orgs').where({ id: org.id }).delete();
	expect(await defaultAccountOf(org.member.id)).toBeNull();
});
