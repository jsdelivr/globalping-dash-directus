import { test, expect } from '@playwright/test';

test('Index page', async ({ page }) => {
	await page.goto('http://localhost:13010');
	await expect(page.getByLabel('Profile')).toHaveText('jimaek');
	await expect(page.getByRole('heading')).toHaveText('Overview');
});
