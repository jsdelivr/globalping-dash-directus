import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { actAsOrg, pageAs } from '../utils.ts';

const generateToken = async (page: Page, name: string) => {
	await page.goto('/tokens');
	await page.getByLabel('Generate new token').click();
	await page.getByLabel('Token name').fill(name);
	await page.getByLabel('Generate token').click();
	await expect(page.getByTestId('token-value').locator('code').first()).not.toBeEmpty();
};

const tokenAccountId = async (name: string) => (await sql('gp_tokens').where({ name }).first('account_id'))?.account_id;

test('a token generated while acting as an org belongs to the org, for its admins and members', async ({ browser, org }) => {
	for (const user of [ org.admin, org.member ]) {
		const name = `e2e-org-token-${user.id.split('-')[0]}`;
		const page = await actAsOrg(browser, org, user);
		await generateToken(page, name);

		await expect(page.getByTestId('tokens-table').locator('tbody tr').first()).toContainText(name);
		expect(await tokenAccountId(name)).toBe(org.account_id);

		await page.context().close();
	}
});

test('a token generated on the personal account belongs to the personal account', async ({ browser, org }) => {
	const name = 'e2e-personal-token';
	const page = await pageAs(browser, org.member.email, 'user');
	await generateToken(page, name);

	expect(await tokenAccountId(name)).toBe(org.member.account_id);
	await page.context().close();
});

test('an org viewer can not generate a token, and is told why', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.viewer);
	await page.goto('/tokens');

	const generate = page.getByLabel('Generate new token');
	await expect(generate).toBeDisabled();

	// The tooltip directive binds after hydration, so the hover is retried until the hint shows.
	await expect(async () => {
		await page.mouse.move(0, 0);
		await generate.locator('..').hover();
		await expect(page.getByText('Org viewers can\'t create tokens')).toBeVisible({ timeout: 1000 });
	}).toPass();

	await expect(page.getByTestId('applications-table')).toContainText('No data to show');
	await expect(page.getByText('You can not access this account')).toHaveCount(0);
});

// gp-auth is not part of the e2e environment, so its approval endpoint is answered here and the posted form is captured.
const mockApproval = async (page: Page) => {
	const posted: URLSearchParams[] = [];

	await page.route('**/oauth/approve/**', async (route) => {
		if (route.request().method() === 'GET') {
			return route.fulfill({ json: { client: { name: 'E2E app', owner: { name: null, url: null } } } });
		}

		posted.push(new URLSearchParams(route.request().postData() ?? ''));
		return route.fulfill({ body: 'approved' });
	});

	return posted;
};

test('the approval screen offers the personal account and the orgs where the user is an admin or a member, starting with the active one', async ({ browser, org, org2 }) => {
	await sql('gp_org_members').insert({ id: randomUUID(), org: org2.id, user: org.member.id, role: 'viewer' });

	const page = await actAsOrg(browser, org, org.member);
	await sql('directus_users').where({ id: org.member.id }).update({ selected_orgs: JSON.stringify([ org.id, org2.id ]) });
	const posted = await mockApproval(page);
	await page.goto('/authorize/e2e-public-code');

	const select = page.getByRole('combobox', { name: 'Account' });
	await expect(select).toHaveText(org.name);

	await select.click();
	await expect(page.getByRole('option')).toHaveText([ org.member.github_username, org.name ]);

	await page.getByRole('option', { name: org.member.github_username }).click();
	await page.getByRole('button', { name: 'Authorize' }).click();

	await expect.poll(() => posted.length).toBe(1);
	expect(posted[0]!.get('approved')).toBe('1');
	expect(posted[0]!.get('accountId')).toBe(org.member.account_id);
});

test('the approval screen names the personal account without a picker when no org can be offered', async ({ browser, org }) => {
	const page = await actAsOrg(browser, org, org.viewer);
	const posted = await mockApproval(page);
	await page.goto('/authorize/e2e-public-code');

	await expect(page.getByText(`to perform measurements under your ${org.viewer.github_username} account.`)).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Account' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Authorize' }).click();

	await expect.poll(() => posted.length).toBe(1);
	expect(posted[0]!.get('accountId')).toBe(org.viewer.account_id);
});
