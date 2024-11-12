import { test } from '../fixtures.ts';

test('Mock generate test template', async ({ page }) => {
	await page.goto('/');
	await page.pause();
});
