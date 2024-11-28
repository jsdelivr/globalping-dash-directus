import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomToken } from '../utils.ts';

const addToken = async (user: User) => {
	await sql('gp_tokens').insert({
		name: 'e2e-test-existing-token',
		value: randomToken(),
		date_created: '2024-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: '["https://globalping.io"]',
		user_created: user.id,
		user_updated: null,
	});
};

test('Tokens page', async ({ page, user }) => {
	await addToken(user);
	await page.goto('/tokens');
	await expect(page.locator('h1')).toHaveText('Tokens');

	// Validate token data is in table
	await expect(page.locator('tbody tr').first()).toContainText('e2e-test-existing-token');
	await expect(page.locator('tbody tr').first()).toContainText('https://globalping.io');
});

test('Generate new token', async ({ page }) => {
	await page.goto('/tokens');

	// Generating a token
	await page.getByLabel('Generate new token').click();
	await page.getByLabel('Token name').fill('e2e-test-new-token');
	await page.getByRole('button', { name: '3 months' }).click();
	await page.getByRole('combobox').fill('www.jsdelivr.com');
	await page.getByLabel('Generate token').click();

	// Validate new token value is shown
	await expect(page.getByTestId('token-value').locator('code').first()).not.toBeEmpty();
	await page.getByRole('cell').getByLabel('Close').click();
	await expect(page.getByTestId('token-value').locator('code')).toHaveCount(0);

	// Validate new token data is in table
	await expect(page.locator('tbody tr').first()).toContainText('e2e-test-new-token');
	await expect(page.locator('tbody tr').first()).toContainText('https://www.jsdelivr.com');
});

test('Regenerate token', async ({ page, user }) => {
	await addToken(user);
	await page.goto('/tokens');

	// Regenerate token
	await page.getByLabel('Options').click();
	await page.getByLabel('Regenerate token').locator('a').click();
	await page.getByLabel('Regenerate', { exact: true }).click();

	// Validate new token value is shown
	await expect(page.getByTestId('token-value').locator('code').first()).not.toBeEmpty();
	await page.getByRole('cell').getByLabel('Close').click();
	await expect(page.getByTestId('token-value').locator('code')).toHaveCount(0);
});

test('Delete token', async ({ page, user }) => {
	await addToken(user);
	await page.goto('/tokens');

	// Delete token
	await page.getByLabel('Options').click();
	await page.getByLabel('Delete').locator('a').click();
	await page.getByRole('button', { name: 'Delete token' }).click();

	// Validate that page is empty
	await expect(page.getByText('No data to show')).toBeVisible();
});
