import { test, expect } from '@playwright/test';
import { getUser, client as sql } from './utils/client.ts';

test.beforeEach(async () => {
	await sql('gp_tokens').delete();
});

const addToken = async () => {
	const user = await getUser();
	await sql('gp_tokens').insert({
		name: 'e2e-test-existing-token',
		value: '/bSluuDrAPX9zIiZZ/hxEKARwOg+e//EdJgCFpmApbg=', // token: hf2fnprguymlgliirdk7qv23664c2xcr
		date_created: '2024-02-22 10:55:21',
		date_last_used: null,
		date_updated: null,
		expire: null,
		origins: '["https://globalping.io"]',
		user_created: user.id,
		user_updated: null,
	});
};

test('Tokens page', async ({ page }) => {
	await addToken();
	await page.goto('/tokens');
	await expect(page.getByRole('heading')).toHaveText('Tokens');

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
	await expect(page.locator('#e2e_token-value code').first()).not.toBeEmpty();
	await page.getByRole('cell').getByLabel('Close').click();
	await expect(page.locator('#e2e_token-value code')).toHaveCount(0);

	// Validate new token data is in table
	await expect(page.locator('tbody tr').first()).toContainText('e2e-test-new-token');
	await expect(page.locator('tbody tr').first()).toContainText('https://www.jsdelivr.com');
});

test('Regenerate token', async ({ page }) => {
	await addToken();
	await page.goto('/tokens');

	// Regenerate token
	await page.getByLabel('Options').click();
	await page.getByLabel('Regenerate token').locator('a').click();
	await page.getByLabel('Regenerate', { exact: true }).click();

	// Validate new token value is shown
	await expect(page.locator('#e2e_token-value code').first()).not.toBeEmpty();
	await page.getByRole('cell').getByLabel('Close').click();
	await expect(page.locator('#e2e_token-value code')).toHaveCount(0);
});

test('Delete token', async ({ page }) => {
	await addToken();
	await page.goto('/tokens');

	// Delete token
	await page.getByLabel('Options').click();
	await page.getByLabel('Delete').locator('a').click();
	await page.getByRole('button', { name: 'Delete token' }).click();

	// Validate that page is empty
	await expect(page.getByText('No data to show')).toBeVisible();
});
