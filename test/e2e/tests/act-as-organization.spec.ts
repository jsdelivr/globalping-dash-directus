import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { User } from '../types.ts';
import { addProbe, pageAs, sessionAccount } from '../utils.ts';

const selectOrgs = (user: User, orgIds: string[]) => sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify(orgIds) });

const selectedOrgsOf = async (user: User) => {
	const row = await sql('directus_users').where({ id: user.id }).first('selected_orgs');
	return JSON.parse(row.selected_orgs) as string[];
};

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
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
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

	// gp-api reads the account from the same session.
	await expect.poll(() => sessionAccount(page)).toBe(org.account_id);

	// The choice survives a reload.
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByTestId('total-credits')).toHaveText('777');

	await switchTo(page, org.member.github_username);
	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect(page.getByTestId('total-credits')).toHaveText('0');
	await page.goto('/probes');
	await expect(page.getByText('e2e-probe-of-the-member').first()).toBeVisible();
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
});

test('the mobile menu switches the account too', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.setViewportSize({ width: 400, height: 900 });
	await page.goto('/');

	await page.getByLabel('Menu').click();
	await Promise.all([ page.waitForEvent('load'), page.locator('[data-pc-name="drawer"]').getByRole('button', { name: org.name }).click() ]);

	await expect.poll(() => sessionAccount(page)).toBe(org.account_id);
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
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);

	// The same when the selection changes elsewhere, e.g. on another device: the session switches to the personal account, so gp-api follows too.
	await selectOrgs(org.member, [ org.id ]);
	await page.reload();
	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await selectOrgs(org.member, []);
	await page.reload();

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
});

test('a session acting as an org the user is not in falls back to the personal account', async ({ browser, org, user }) => {
	const page = await pageAs(browser, user.email, 'user');
	await sql('directus_sessions').where({ user: user.id }).update({ active_account: org.account_id });
	await page.goto('/');

	await expect(page.getByLabel('Profile')).toContainText(user.github_username);
	await expect.poll(() => sessionAccount(page)).toBe(user.account_id);
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
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
});

test('signing out drops the active account, and signing in again starts in the default account', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');
	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);

	await page.getByLabel('Profile').click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);

	const response = await page.request.post(`${process.env.DIRECTUS_URL}/auth/login`, { data: { email: org.member.email, password: 'user', mode: 'session' } });
	expect(response.ok()).toBe(true);
	await page.goto('/');

	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
});

test('an admin impersonating a user acts as that user\'s orgs, without touching their own session', async ({ browser, org }) => {
	await selectOrgs(org.member, [ org.id ]);
	await addProbe({ account_id: org.account_id, name: 'e2e-probe-of-the-org' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/probes');

	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(org.member.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByText(`Impersonating ${org.member.github_username}`)).toBeVisible();

	const adminAccount = await sessionAccount(page);

	await openAddOrganization(page);
	await expect(orgRow(page, org.name).getByRole('button', { name: 'Remove' })).toBeDisabled();
	await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

	await switchTo(page, org.name);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByText('Organization role: Member')).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-org').first()).toBeVisible();
	expect(await page.evaluate(() => sessionStorage.getItem('impersonationActiveAccount'))).toBe(`${org.member.id}:${org.account_id}`);
	expect(await sessionAccount(page)).toBe(adminAccount);
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

		await expect.poll(() => sessionAccount(page)).toBe(org.account_id);

		await page.getByLabel('Admin Panel').click();
		await page.getByRole('switch').click();
		await expect(page.getByLabel('Profile')).toContainText(org.name);
	} finally {
		await sql('directus_users').where({ id: admin.id }).update({ selected_orgs: '[]' });
	}
});
