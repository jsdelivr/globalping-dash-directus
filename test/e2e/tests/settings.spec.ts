import { test, expect } from '../fixtures.ts';

test('Settings page', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.locator('h1')).toHaveText('Settings');

	// Make sure new token value is set to the auth.user after the save.
	await page.getByLabel('Regenerate').click();
	await page.getByLabel('Apply settings').click();

	await page.getByLabel('First Name').fill('Johnny');
	await page.getByLabel('johndoe').click();
	await page.locator('#defaultPrefix_1').getByText('Scrubs').click();
	await page.getByLabel('Regenerate').click();
	await page.getByLabel('Apply settings').click();

	await page.goto('/settings');
	await expect(page.getByLabel('First Name')).toHaveValue('Johnny');
});
