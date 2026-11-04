import { test, expect } from '../fixtures.ts';
import { client } from '../client.ts';

test('Settings page', async ({ page }) => {
	const applySettings = async () => {
		const saved = page.waitForResponse(response => response.url().includes('/users/me') && response.request().method() === 'PATCH');
		await page.getByLabel('Apply settings').click();
		expect((await saved).ok()).toBe(true);
	};

	await page.goto('/settings');
	await expect(page.locator('h1')).toHaveText('Settings');

	// Make sure new token value is set to the auth.user after the save.
	await page.getByLabel('Regenerate').click();
	await applySettings();

	await page.getByLabel('Last Name').fill('Reid-Dorian');
	await page.getByLabel('Regenerate').click();
	await applySettings();

	await page.goto('/settings');
	await expect(page.getByLabel('Last Name')).toHaveValue('Reid-Dorian');
});

test('the default tag prefix is hidden while it is the username', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.getByLabel('Last Name')).toBeVisible();

	await expect(page.getByText('Default tag prefix')).toHaveCount(0);
});

test('a default tag prefix set to an org name can only be moved back to the username', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({ default_prefix: 'Scrubs' });
	await page.goto('/settings');
	await expect(page.getByText('Default tag prefix')).toBeVisible();

	await page.locator('#defaultPrefix').click();
	await expect(page.locator('[data-pc-section=option]')).toHaveText([ 'Scrubs', user.github_username ]);
	await page.locator('[data-pc-section=option]').filter({ hasText: user.github_username }).click();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect(page.getByText('Default tag prefix')).toHaveCount(0);
	expect((await client('directus_users').where({ id: user.id }).first('default_prefix')).default_prefix).toBe(user.github_username);
});

test('Delete account', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Delete account').click();
	await page.getByRole('dialog', { name: 'Delete account' }).getByLabel('Delete account').click();
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});
