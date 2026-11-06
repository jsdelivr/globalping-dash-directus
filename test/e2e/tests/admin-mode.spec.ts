import { test, expect } from '../fixtures.ts';
import { addApplication, addProbe, addToken, pageAs } from '../utils.ts';

test('Admin mode shows the probes of every user, impersonation narrows them to one', async ({ browser, user }) => {
	await addProbe({ account_id: user.account_id, name: 'e2e-probe-of-the-user' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/probes');
	await expect(page.locator('h1')).toHaveText('Probes');

	// The admin owns nothing, so their own list is empty until admin mode is on.
	await expect(page.locator('tbody tr')).toHaveCount(0);

	await page.getByLabel('Admin Panel').click();
	await page.getByRole('switch').click();
	await expect(page.getByText('Admin Mode')).toBeVisible();

	// Probes of other users, which the admin has no other way to see.
	await expect(page.locator('tbody tr').first()).toBeVisible();

	// Impersonation replaces the account every list is filtered by, so the probe of that user shows up as their own.
	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(user.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-user').first()).toBeVisible();
});

test('Admin mode shows the applications of every user, impersonation narrows them to one', async ({ browser, user }) => {
	await addApplication({ accountId: user.account_id, userId: user.id, name: 'e2e-app-of-the-user' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/tokens');
	await expect(page.locator('h1')).toHaveText('Your tokens');

	// The admin approved nothing, so their own list is empty until admin mode is on.
	await expect(page.locator('tbody tr')).toHaveCount(0);

	await page.getByLabel('Admin Panel').click();
	await page.getByRole('switch').click();
	await expect(page.getByText('Admin Mode')).toBeVisible();

	// Applications of other users, which the admin has no other way to see.
	await expect(page.locator('tbody tr').first()).toBeVisible();

	// Impersonation sends the account of the user while the session stays the admin's.
	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(user.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();
	await expect(page.getByText('e2e-app-of-the-user').first()).toBeVisible();
});

test('Admin mode shows the tokens of every user, impersonation narrows them to one', async ({ browser, user, org }) => {
	await addToken({ accountId: user.account_id, userId: user.id, name: 'e2e-token-of-the-user' });
	await addToken({ accountId: org.admin.account_id, userId: org.admin.id, name: 'e2e-token-of-another-user' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/tokens');
	await expect(page.locator('h1')).toHaveText('Your tokens');

	// The admin created nothing, so their own list is empty until admin mode is on.
	await expect(page.getByTestId('tokens-table').locator('tbody tr')).toHaveCount(0);

	await page.getByLabel('Admin Panel').click();
	await page.getByRole('switch').click();
	await expect(page.getByText('Admin Mode')).toBeVisible();

	await expect(page.getByTestId('tokens-table').locator('tbody tr')).toHaveCount(5);

	// Impersonation filters by the account and the creator of that user while the session stays the admin's.
	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(user.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();
	await expect(page.getByTestId('tokens-table')).toContainText('e2e-token-of-the-user');
	await expect(page.getByTestId('tokens-table')).not.toContainText('e2e-token-of-another-user');
});
