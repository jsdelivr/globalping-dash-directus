import { test, expect } from '@playwright/test';

test('Generate new token', async ({ page }) => {
	await page.goto('http://localhost:13010/tokens');
	await expect(page.getByRole('heading')).toHaveText('Tokens');

	// Generating a token
	await page.getByLabel('Generate new token').click();
	await page.getByLabel('Token name').fill('e2e-test-token-1');
	await page.getByRole('button', { name: '3 months' }).click();
	await page.getByRole('combobox').fill('www.jsdelivr.com');
	await page.getByLabel('Generate token').click();

	// Validate new token value is shown
	await expect(page.locator('[data-pc-section="rowexpansioncell"] code').first()).not.toBeEmpty();

	await page.getByRole('cell').getByLabel('Close').click();
	await expect(page.locator('[data-pc-section="rowexpansioncell"] code')).toHaveCount(0);

	// Validate new token data is in table
	await expect(page.locator('tbody tr').first()).toContainText('e2e-test-token-1');
	await expect(page.locator('tbody tr').first()).toContainText('https://www.jsdelivr.com');
});
