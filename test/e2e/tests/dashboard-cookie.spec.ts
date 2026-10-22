import { test, expect } from '../fixtures.js';
import { COOKIE_NAME, decodeJwt } from '../utils.ts';

test('Dashboard cookie format', async ({ page, user }) => {
	await page.goto('/');
	const allCookies = await page.context().cookies();

	const cookie = allCookies.find(c => c.name === COOKIE_NAME);
	expect(cookie).toBeTruthy();

	const payload = decodeJwt(cookie.value);
	expect(payload).toBeTruthy();

	expect(typeof payload.app_access).toBe('boolean');
	expect(typeof payload.admin_access).toBe('boolean');

	expect(typeof payload.id).toBe('string');
	expect(payload.id).toBe(user.id);
	expect(typeof payload.github_username).toBe('string');
	expect(payload.github_username).toBe(user.github_username);
	expect(typeof payload.user_type).toBe('string');
	expect(payload.user_type).toBe('sponsor');

	expect(typeof payload.user_account_id).toBe('string');
	expect(payload.user_account_id).toBe(user.account_id);
	expect(payload.active_account_id).toBe(user.account_id);
	expect(payload.active_account_role).toBe('owner');

	expect(typeof payload.role).toBe('string');
	expect(payload.role.length).toBeGreaterThan(0);

	expect(typeof payload.session).toBe('string');
	expect(payload.session.length).toBeGreaterThan(0);

	expect(typeof payload.iat).toBe('number');
	expect(typeof payload.exp).toBe('number');
	expect(payload.iss).toBe('directus');
});
