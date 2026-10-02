import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { User } from '../types.ts';
import { addProbe, pageAs } from '../utils.ts';

const selectOrgs = (user: User, orgIds: string[]) => sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify(orgIds) });

const selectedOrgsOf = async (user: User) => {
	const row = await sql('directus_users').where({ id: user.id }).first('selected_orgs');
	return JSON.parse(row.selected_orgs) as string[];
};

const activeAccountCookie = async (page: Page) => (await page.context().cookies()).find(cookie => cookie.name === 'gp_active_account')?.value;

const openAccounts = async (page: Page) => {
	await page.getByLabel('Profile').click();
	await page.getByRole('menuitem', { name: 'Act as organization' }).click();
};

const openAddOrganization = async (page: Page) => {
	await openAccounts(page);
	await page.getByRole('menuitem', { name: 'Add organization' }).click();
};

const orgRow = (page: Page, name: string) => page.getByRole('dialog').getByRole('row', { name });

const switchTo = async (page: Page, name: string) => {
	await openAccounts(page);
	await Promise.all([ page.waitForEvent('load'), page.getByRole('menuitem', { name, exact: true }).click() ]);
};

test('an org added through "Add organization" appears in the menu without becoming active', async ({ browser, org }) => {
	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');

	await openAccounts(page);
	await expect(page.getByRole('menuitem', { name: org.name, exact: true })).toHaveCount(0);

	await page.getByRole('menuitem', { name: 'Add organization' }).click();
	await orgRow(page, org.name).getByRole('button', { name: 'Add' }).click();
	await expect(orgRow(page, org.name).getByRole('button', { name: 'Remove' })).toBeVisible();
	expect(await selectedOrgsOf(org.member)).toEqual([ org.id ]);

	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
	await openAccounts(page);
	await expect(page.getByRole('menuitem', { name: org.name, exact: true })).toBeVisible();

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	expect(await activeAccountCookie(page)).toBeUndefined();
});

test('acting as an org switches every list and the header to it, and back', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);
	await addProbe({ account_id: org.account_id, name: 'e2e-probe-of-the-org' });
	await addProbe({ account_id: org.member.account_id, userId: org.member.id, name: 'e2e-probe-of-the-member' });
	await sql('gp_credits').insert({ account_id: org.account_id, amount: 777 });

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/probes');
	await expect(page.getByText('e2e-probe-of-the-member').first()).toBeVisible();

	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByText('e2e-probe-of-the-org').first()).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-member')).toHaveCount(0);

	// gp-api reads the same cookie, as the user and the account separated by a colon.
	expect(await activeAccountCookie(page)).toBe(`${org.member.id}:${org.account_id}`);

	// The choice survives a reload.
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByTestId('total-credits')).toHaveText('777');

	await switchTo(page, org.member.github_username);
	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect(page.getByTestId('total-credits')).toHaveText('0');
	await page.goto('/probes');
	await expect(page.getByText('e2e-probe-of-the-member').first()).toBeVisible();
	expect(await activeAccountCookie(page)).toBeUndefined();
});

test('the mobile menu switches the account too', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.setViewportSize({ width: 400, height: 900 });
	await page.goto('/');

	await page.getByLabel('Menu').click();
	await Promise.all([ page.waitForEvent('load'), page.locator('[data-pc-name="drawer"]').getByRole('button', { name: org.name }).click() ]);

	expect(await activeAccountCookie(page)).toBe(`${org.member.id}:${org.account_id}`);
});

test('a user in no org is told so in "Add organization"', async ({ browser, user }) => {
	const page = await pageAs(browser, user.email, 'user');
	await page.goto('/');

	await openAddOrganization(page);
	await expect(page.getByRole('dialog')).toContainText('You are not a member of any organization on GitHub.');
});

test('a viewer acts as the org and sees its probes', async ({ browser, org }) => {
	await selectOrgs(org.viewer, [ org.id ]);
	await addProbe({ account_id: org.account_id, name: 'e2e-probe-of-the-org' });

	const page = await pageAs(browser, org.viewer.email, 'user');
	await page.goto('/probes');
	await switchTo(page, org.name);

	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByText('Organization role: Viewer')).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-org').first()).toBeVisible();
});

test('removing the active org, or its disappearing from the selection, switches back to the personal account', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');
	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);

	await openAddOrganization(page);
	await Promise.all([ page.waitForEvent('load'), orgRow(page, org.name).getByRole('button', { name: 'Remove' }).click() ]);

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	expect(await activeAccountCookie(page)).toBeUndefined();

	// The same when the selection changes elsewhere, e.g. on another device: the stale cookie is dropped, so gp-api follows too.
	await selectOrgs(org.member, [ org.id ]);
	await page.reload();
	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await selectOrgs(org.member, []);
	await page.reload();

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	expect(await activeAccountCookie(page)).toBeUndefined();
});

test('a cookie naming an org the user is not in is ignored and dropped', async ({ browser, org, user }) => {
	const page = await pageAs(browser, user.email, 'user');
	await page.context().addCookies([{ name: 'gp_active_account', value: `${user.id}:${org.account_id}`, url: process.env.DASH_URL! }]);
	await page.goto('/');

	await expect(page.getByLabel('Profile')).toContainText(user.github_username);
	expect(await activeAccountCookie(page)).toBeUndefined();
});

test('leaving the active org switches back to the personal account', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');
	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);

	await sql('gp_org_members').where({ org: org.id, user: org.member.id }).delete();
	await page.reload();

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	expect(await activeAccountCookie(page)).toBeUndefined();
});

test('the active org stays after signing out, and another user signing in ignores it', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);
	await selectOrgs(org.admin, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');
	await switchTo(page, org.name);

	await page.getByLabel('Profile').click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);
	expect(await activeAccountCookie(page)).toBe(`${org.member.id}:${org.account_id}`);

	const response = await page.request.post(`${process.env.DIRECTUS_URL}/auth/login`, { data: { email: org.admin.email, password: 'user', mode: 'session' } });
	expect(response.ok()).toBe(true);
	await page.goto('/');

	await expect(page.getByLabel('Profile')).toContainText(org.admin.github_username);
	expect(await activeAccountCookie(page)).toBe(`${org.member.id}:${org.account_id}`);
});

test('an admin impersonating a user acts as that user\'s orgs, without touching their own cookie', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);
	await addProbe({ account_id: org.account_id, name: 'e2e-probe-of-the-org' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/probes');

	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(org.member.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByText(`Impersonating ${org.member.github_username}`)).toBeVisible();

	const admin = await sql('directus_users').where({ email: process.env.ADMIN_EMAIL }).first('id');
	const adminCookie = `${admin.id}:${randomUUID()}`;
	await page.context().addCookies([{ name: 'gp_active_account', value: adminCookie, url: process.env.DASH_URL! }]);

	await openAddOrganization(page);
	await expect(orgRow(page, org.name).getByRole('button', { name: 'Remove' })).toBeDisabled();
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByText('Organization role: Member')).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-org').first()).toBeVisible();
	expect(await page.evaluate(() => sessionStorage.getItem('impersonationActiveAccount'))).toBe(`${org.member.id}:${org.account_id}`);
	expect(await activeAccountCookie(page)).toBe(adminCookie);
});

test('admin mode offers no account to act as, and leaving it brings the active org back', async ({ browser, org }) => {
	const admin = await sql('directus_users').where({ email: process.env.ADMIN_EMAIL }).first('id');
	await sql('gp_org_members').insert({ id: randomUUID(), org: org.id, user: admin.id, role: 'member' });
	await sql('directus_users').where({ id: admin.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });

	try {
		const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
		await page.goto('/probes');
		await switchTo(page, org.name);
		await expect(page.getByLabel('Profile')).toContainText(org.name);

		await page.getByLabel('Admin Panel').click();
		await page.getByRole('switch').click();
		await expect(page.getByText('Admin Mode')).toBeVisible();

		await page.getByLabel('Profile').click();
		await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Act as organization' })).toHaveCount(0);
		await page.keyboard.press('Escape');

		expect(await activeAccountCookie(page)).toBe(`${admin.id}:${org.account_id}`);

		await page.getByLabel('Admin Panel').click();
		await page.getByRole('switch').click();
		await expect(page.getByLabel('Profile')).toContainText(org.name);
	} finally {
		await sql('directus_users').where({ id: admin.id }).update({ selected_orgs: '[]' });
	}
});
