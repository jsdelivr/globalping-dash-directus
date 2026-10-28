import { request, type APIRequestContext } from '@playwright/test';
import { client as sql } from '../client.ts';
import { test, expect } from '../fixtures.ts';
import { COOKIE_NAME, decodeJwt } from '../utils.ts';
import type { User } from '../types.ts';

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const FORBIDDEN = 'You can not access this account.';

// A cookie-based session, the way the dashboard talks to Directus. The active account lives on the session row, so every actor needs its own.
const sessionAs = async (user: User) => {
	const context = await request.newContext({ baseURL: DIRECTUS_URL, storageState: undefined });
	await login(context, user);
	return context;
};

const login = async (context: APIRequestContext, user: User) => {
	const response = await context.post('/auth/login', { data: { email: user.email, password: 'user', mode: 'session' } });
	expect(response.ok()).toBe(true);
};

const refresh = async (context: APIRequestContext) => {
	const response = await context.post('/auth/refresh', { data: { mode: 'session' } });
	expect(response.ok()).toBe(true);
};

const claims = async (context: APIRequestContext) => {
	const { cookies } = await context.storageState();
	const cookie = cookies.find(c => c.name === COOKIE_NAME);
	expect(cookie).toBeTruthy();
	return decodeJwt(cookie!.value);
};

const cookieOf = async (context: APIRequestContext) => (await context.storageState()).cookies.find(c => c.name === COOKIE_NAME)!.value;

const activeAccount = async (context: APIRequestContext) => (await context.get('/accounts/active')).json();

const setActiveAccount = (context: APIRequestContext, accountId: string) => context.post('/accounts/active', { data: { accountId } });

test('a session starts with the personal account', async ({ user }) => {
	const session = await sessionAs(user);

	expect(await activeAccount(session)).toEqual({ accountId: user.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: user.account_id, active_account_role: 'owner' });
});

test('any org member can act as the org, and the session keeps the choice across refreshes', async ({ org }) => {
	for (const [ user, role ] of [ [ org.admin, 'admin' ], [ org.member, 'member' ], [ org.viewer, 'viewer' ] ] as const) {
		const session = await sessionAs(user);
		expect((await setActiveAccount(session, org.account_id)).status()).toBe(200);

		// The choice reaches the token, and so the readers, with the next refresh.
		expect(await activeAccount(session)).toEqual({ accountId: user.account_id });
		await refresh(session);
		expect(await activeAccount(session)).toEqual({ accountId: org.account_id });
		expect(await claims(session)).toMatchObject({ active_account_id: org.account_id, active_account_role: role, user_account_id: user.account_id });

		await refresh(session);
		expect(await claims(session)).toMatchObject({ active_account_id: org.account_id, active_account_role: role });
	}
});

test('the personal account can be reselected', async ({ org }) => {
	const session = await sessionAs(org.member);
	expect((await setActiveAccount(session, org.account_id)).status()).toBe(200);
	expect((await setActiveAccount(session, org.member.account_id)).status()).toBe(200);

	await refresh(session);
	expect(await activeAccount(session)).toEqual({ accountId: org.member.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: org.member.account_id, active_account_role: 'owner' });
});

test('a refresh retried with the old cookie keeps the newer choice of the session', async ({ org }) => {
	const session = await sessionAs(org.member);
	expect((await setActiveAccount(session, org.account_id)).status()).toBe(200);
	const oldCookie = await cookieOf(session);
	await refresh(session);
	expect((await setActiveAccount(session, org.member.account_id)).status()).toBe(200);

	// Inside the refresh grace period the old cookie is still valid, and its refresh returns the same new session again.
	const stale = await request.newContext({ baseURL: DIRECTUS_URL });
	expect((await stale.post('/auth/refresh', { headers: { cookie: `${COOKIE_NAME}=${oldCookie}` }, data: { mode: 'session' } })).ok()).toBe(true);

	await refresh(session);
	expect(await activeAccount(session)).toEqual({ accountId: org.member.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: org.member.account_id, active_account_role: 'owner' });
});

test('a switch sent with the old cookie reaches the refreshed session', async ({ org }) => {
	const session = await sessionAs(org.member);
	const oldCookie = await cookieOf(session);
	await refresh(session);

	// A request still carrying the old cookie lands on the old session row, which the refresh already rotated into a new one.
	const stale = await request.newContext({ baseURL: DIRECTUS_URL });
	expect((await stale.post('/accounts/active', { headers: { cookie: `${COOKIE_NAME}=${oldCookie}` }, data: { accountId: org.account_id } })).status()).toBe(200);

	await refresh(session);
	expect(await activeAccount(session)).toEqual({ accountId: org.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: org.account_id, active_account_role: 'member' });
});

test('losing the membership falls back to the personal account on the next refresh', async ({ org }) => {
	const session = await sessionAs(org.member);
	expect((await setActiveAccount(session, org.account_id)).status()).toBe(200);
	await sql('gp_org_members').where({ org: org.id, user: org.member.id }).delete();

	await refresh(session);
	expect(await activeAccount(session)).toEqual({ accountId: org.member.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: org.member.account_id, active_account_role: 'owner' });
});

test('an outsider can not act as the org', async ({ org, org2, user }) => {
	for (const outsider of [ user, org2.admin ]) {
		const session = await sessionAs(outsider);
		const response = await setActiveAccount(session, org.account_id);
		expect(response.status()).toBe(400);
		expect(await response.text()).toBe(FORBIDDEN);

		await refresh(session);
		expect(await activeAccount(session)).toEqual({ accountId: outsider.account_id });
		expect(await claims(session)).toMatchObject({ active_account_id: outsider.account_id, active_account_role: 'owner' });
	}
});

test('a bearer token has no session to store the choice on', async ({ org }) => {
	const context = await request.newContext({ baseURL: DIRECTUS_URL, storageState: undefined });
	const login = await context.post('/auth/login', { data: { email: org.admin.email, password: 'user' } });
	const headers = { Authorization: `Bearer ${(await login.json()).data.access_token}` };

	expect((await context.post('/accounts/active', { headers, data: { accountId: org.account_id } })).status()).toBe(400);
	expect((await context.get('/accounts/active', { headers })).status()).toBe(400);
});

test('logging out drops the choice', async ({ org }) => {
	const session = await sessionAs(org.admin);
	expect((await setActiveAccount(session, org.account_id)).status()).toBe(200);

	expect((await session.post('/auth/logout', { data: { mode: 'session' } })).ok()).toBe(true);
	await login(session, org.admin);

	expect(await activeAccount(session)).toEqual({ accountId: org.admin.account_id });
	expect(await claims(session)).toMatchObject({ active_account_id: org.admin.account_id, active_account_role: 'owner' });
});
