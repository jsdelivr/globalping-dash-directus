import { test, expect } from '../fixtures.js';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'dash_session_token';

const decodeJwt = (jwt: string) => {
	const encoded = jwt.split('.')[1];

	if (!encoded) {
		return null;
	}

	try {
		const json = Buffer.from(encoded, 'base64url').toString();
		return JSON.parse(json);
	} catch {
		return null;
	}
};

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

	expect(typeof payload.role).toBe('string');
	expect(payload.role.length).toBeGreaterThan(0);

	expect(typeof payload.session).toBe('string');
	expect(payload.session.length).toBeGreaterThan(0);

	expect(typeof payload.iat).toBe('number');
	expect(typeof payload.exp).toBe('number');
	expect(payload.iss).toBe('directus');
});
