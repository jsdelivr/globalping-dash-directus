import { test, expect } from '../fixtures.ts';
import { addProbe, pageAs } from '../utils.ts';

test('Admin mode shows the probes of every user, impersonation narrows them to one', async ({ browser, user }) => {
	await addProbe({ account_id: user.account_id, userId: user.id, name: 'e2e-probe-of-the-user' });

	const page = await pageAs(browser, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
	await page.goto('/probes');
	await expect(page.locator('h1')).toHaveText('Probes');

	// The admin owns nothing, so their own list is empty until admin mode is on.
	await expect(page.getByText('e2e-probe-of-the-user')).toHaveCount(0);

	await page.getByLabel('Admin Panel').click();
	await page.getByRole('switch').click();
	await expect(page.getByText('Admin Mode')).toBeVisible();
	await expect(page.locator('tbody tr').first()).toBeVisible();

	// Impersonation replaces the account every list is filtered by, so the probe of that user shows up as their own.
	await page.getByLabel('Admin Panel').click();
	await page.getByPlaceholder('Enter username').fill(user.github_username);
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByText(`Impersonating ${user.github_username}`)).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-user').first()).toBeVisible();
});
