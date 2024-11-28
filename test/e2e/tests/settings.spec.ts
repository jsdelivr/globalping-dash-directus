import { test, expect } from '../fixtures.ts';

test('Settings page', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.locator('h1')).toHaveText('Settings');
	await page.getByLabel('First Name').fill('Johnny');
	await page.getByLabel('Apply settings').click();
	await page.goto('/settings');
	await expect(page.getByLabel('First Name')).toHaveValue('Johnny');
});
