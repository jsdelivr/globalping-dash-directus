import { test, expect } from '@playwright/test';

test('Index page', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toHaveText('johndoe');
	await expect(page.getByRole('heading')).toHaveText('Overview');
});
