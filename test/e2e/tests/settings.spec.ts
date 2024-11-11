import { test, expect } from '@playwright/test';

test('Settings page', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('First Name').fill('Johnny');
	await page.getByLabel('Apply settings').click();
	await page.goto('/settings');
	await expect(page.getByLabel('First Name')).toHaveValue('Johnny');
});
