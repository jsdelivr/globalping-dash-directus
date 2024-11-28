import { test } from './fixtures.ts';

// This test is used in `pnpm run test:e2e:generate` to generate new tests.
test('Mock generate test template', async ({ page }) => {
	await page.goto('/');
	await page.pause();
});
