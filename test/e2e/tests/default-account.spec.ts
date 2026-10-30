import type { Browser, Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import type { Org, User } from '../types.ts';
import { pageAs, png, sessionAccount } from '../utils.ts';

// A user who hasn't picked a default account yet, signed in.
const onboard = async (browser: Browser, user: User) => {
	await sql('directus_users').where({ id: user.id }).update({ default_account: null, selected_orgs: JSON.stringify([]) });
	return pageAs(browser, user.email, 'user');
};

const userRow = (user: User) => sql('directus_users').where({ id: user.id }).first('default_account', 'selected_orgs', 'public_probes');
const orgRow = (org: Org) => sql('gp_orgs').where({ id: org.id }).first('public_probes', 'website', 'description');

const dialogOf = async (page: Page) => {
	await page.goto('/');
	const dialog = page.getByRole('dialog', { name: 'Few more steps to go!' });
	await expect(dialog).toBeVisible();
	return dialog;
};

const pickOrg = async (page: Page, org: Org) => {
	const dialog = page.getByRole('dialog');
	await dialog.locator('label').filter({ has: page.getByRole('radio', { name: /^Organization/ }) }).click();
	await dialog.getByRole('combobox').click();
	await page.locator('[data-pc-section=option]').filter({ hasText: org.name }).click();
	return dialog;
};

test('skipping the onboarding makes the personal account the default', async ({ browser, user }) => {
	const page = await onboard(browser, user);
	const dialog = await dialogOf(page);

	await dialog.getByRole('button', { name: 'Skip' }).click();
	await expect(dialog).toBeHidden();
	expect((await userRow(user)).default_account).toBe(user.account_id);

	await page.reload();
	await expect(page.getByLabel('Profile')).toContainText(user.github_username);
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a user in no org can only pick the personal account, and make their probes public', async ({ browser, user }) => {
	const page = await onboard(browser, user);
	const dialog = await dialogOf(page);

	await expect(dialog.getByRole('radio', { name: /^Organization/ })).toBeDisabled();
	await expect(dialog).toContainText('You aren\'t a member of any GitHub organization yet.');

	await dialog.locator('#onboarding-public-probes').check();
	await dialog.getByRole('button', { name: 'Apply' }).click();
	await expect(dialog).toBeHidden();

	const row = await userRow(user);
	expect(row.default_account).toBe(user.account_id);
	expect(row.public_probes).toBe(1);
});

test('an org admin picks the org: it is selected, becomes the default and active, and gets its settings and profile', async ({ browser, org }) => {
	const page = await onboard(browser, org.admin);
	await dialogOf(page);
	const dialog = await pickOrg(page, org);

	await dialog.locator('#onboarding-org-public-probes').check();
	await dialog.getByLabel('Website URL').fill('example.com');
	await dialog.getByLabel('Website URL').blur();
	await expect(dialog).toContainText('Enter a full URL, e.g. https://example.com');
	await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
	await dialog.getByLabel('Website URL').fill('https://example.com');
	await dialog.getByLabel('Description').fill('We measure the internet.');

	await Promise.all([ page.waitForEvent('load'), dialog.getByRole('button', { name: 'Apply' }).click() ]);
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	const row = await userRow(org.admin);
	expect(row.default_account).toBe(org.account_id);
	expect(JSON.parse(row.selected_orgs)).toEqual([ org.id ]);
	expect(await orgRow(org)).toEqual({ public_probes: 1, website: 'https://example.com', description: 'We measure the internet.' });
	await expect.poll(() => sessionAccount(page)).toBe(org.account_id);
});

test('an org admin adds a banner during the onboarding, which is uploaded on "Apply"', async ({ browser, org }) => {
	const page = await onboard(browser, org.admin);
	await dialogOf(page);
	const dialog = await pickOrg(page, org);
	const pick = (width: number, height: number) => dialog.getByLabel('Banner file').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png(width, height) });

	await pick(1224, 100);
	await expect(dialog.locator('#onboarding-banner-error')).toHaveText('The banner must be at least 1224×200 px.');

	await pick(1224, 200);
	await expect(dialog.getByRole('img', { name: 'Banner preview' })).toHaveAttribute('src', /^blob:/);
	expect((await sql('gp_orgs').where({ id: org.id }).first('banner')).banner).toBe(null);

	await Promise.all([ page.waitForEvent('load'), dialog.getByRole('button', { name: 'Apply' }).click() ]);
	await expect(page.getByRole('dialog')).toHaveCount(0);

	const { banner } = await sql('gp_orgs').where({ id: org.id }).first('banner');
	expect(await sql('directus_files').where({ id: banner }).first('type')).toEqual({ type: 'image/png' });
	expect((await userRow(org.admin)).default_account).toBe(org.account_id);
});

test('the org profile is offered only to admins and only while it is empty', async ({ browser, org }) => {
	const memberPage = await onboard(browser, org.member);
	await dialogOf(memberPage);
	const memberDialog = await pickOrg(memberPage, org);

	await expect(memberDialog.getByText('Make the organization probes public')).toHaveCount(0);
	await expect(memberDialog.getByLabel('Website URL')).toHaveCount(0);
	await Promise.all([ memberPage.waitForEvent('load'), memberDialog.getByRole('button', { name: 'Apply' }).click() ]);
	expect((await userRow(org.member)).default_account).toBe(org.account_id);

	await sql('gp_orgs').where({ id: org.id }).update({ website: 'https://example.com' });
	const adminPage = await onboard(browser, org.admin);
	await dialogOf(adminPage);
	const adminDialog = await pickOrg(adminPage, org);

	await expect(adminDialog.getByText('Make the organization probes public')).toBeVisible();
	await expect(adminDialog.getByLabel('Website URL')).toHaveCount(0);
});

test('a new session opens the default account, or the personal one while the default org is not offered', async ({ browser, org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ default_account: org.account_id, selected_orgs: JSON.stringify([ org.id ]) });

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect.poll(() => sessionAccount(page)).toBe(org.account_id);

	await sql('directus_users').where({ id: org.member.id }).update({ selected_orgs: JSON.stringify([]) });
	const nextPage = await pageAs(browser, org.member.email, 'user');
	await nextPage.goto('/');
	await expect(nextPage.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect.poll(() => sessionAccount(nextPage)).toBe(org.member.account_id);
	expect((await userRow(org.member)).default_account).toBe(org.account_id);
});

test('a session acting as an org the user is not in falls back to the default account', async ({ browser, org, org2 }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ default_account: org.account_id, selected_orgs: JSON.stringify([ org.id ]) });

	const page = await pageAs(browser, org.member.email, 'user');
	await sql('directus_sessions').where({ user: org.member.id }).update({ active_account: org2.account_id });
	await page.goto('/');

	await expect(page.getByLabel('Profile')).toContainText(org.name);
	await expect.poll(() => sessionAccount(page)).toBe(org.account_id);
});

test('a session keeps its own active account, while a new one starts in the default account', async ({ browser, org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ default_account: org.account_id, selected_orgs: JSON.stringify([ org.id ]) });

	const page = await pageAs(browser, org.member.email, 'user');
	await page.context().request.post(`${process.env.DIRECTUS_URL}/accounts/active`, { data: { accountId: org.member.account_id } });
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);

	const nextPage = await pageAs(browser, org.member.email, 'user');
	await nextPage.goto('/');
	await expect(nextPage.getByLabel('Profile')).toContainText(org.name);

	await page.reload();
	await expect(page.getByLabel('Profile')).toContainText(org.member.github_username);
	await expect.poll(() => sessionAccount(page)).toBe(org.member.account_id);
});

test('the default account can be changed in the settings', async ({ browser, org }) => {
	await sql('directus_users').where({ id: org.member.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });

	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/settings');
	await page.getByLabel('Default account').click();
	await page.locator('[data-pc-section=option]').filter({ hasText: org.name }).click();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect.poll(async () => (await userRow(org.member)).default_account).toBe(org.account_id);
});

test('an admin impersonating a user who has not picked a default account sees no onboarding', async ({ browser, user }) => {
	await sql('directus_users').where({ id: user.id }).update({ default_account: null });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/probes');
	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(user.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();

	await page.reload();
	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Few more steps to go!' })).toHaveCount(0);
});
