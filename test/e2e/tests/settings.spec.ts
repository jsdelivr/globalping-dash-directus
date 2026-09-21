import { test, expect } from '../fixtures.ts';

test('Settings page', async ({ page, user }) => {
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
	await page.getByLabel(user.default_prefix).click();
	await page.locator('#defaultPrefix_1').getByText('Scrubs').click();
	await page.getByLabel('Regenerate').click();
	await applySettings();

	await page.goto('/settings');
	await expect(page.getByLabel('Last Name')).toHaveValue('Reid-Dorian');
});

test('Delete account', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Delete account').click();
	await page.getByRole('dialog', { name: 'Delete account' }).getByLabel('Delete account').click();
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});
