import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { loginUser, randomToken } from '../utils.ts';
import { randomUUID } from 'node:crypto';

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

const addApplication = async (user: User) => {
	const appId = randomUUID();

	await sql('gp_apps').insert({
		id: appId,
		user_created: user.id,
		date_created: '2024-09-01 00:00:00',
		name: 'Auth Code App',
		secrets: JSON.stringify([ 'QicY5X3BLipbyojWkfzyd0vRYth/C/2GsCYw6VRfLgI=' ]), // secret: ic3sba25i27s6gic3ksb376krrmtsjbxk2uzn7v5fk6gmiqj
		grants: JSON.stringify([ 'authorization_code', 'refresh_token' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	});

	await sql('gp_apps_approvals').insert([{
		id: randomUUID(),
		user: user.id,
		app: appId,
		scopes: JSON.stringify([ 'measurements' ]),
	}]);

	const [ refreshTokenId ] = await sql('gp_tokens').insert({
		date_created: '2025-01-03 16:13:45',
		date_last_used: null,
		date_updated: null,
		expire: '2025-07-02',
		name: 'For Auth Code App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: randomToken(),
		app_id: appId,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'refresh_token',
		parent: null,
	});

	await sql('gp_tokens').insert({
		date_created: '2025-01-03 16:13:45',
		date_last_used: null,
		date_updated: null,
		expire: '2025-02-02',
		name: 'For Auth Code App',
		origins: '[]',
		user_created: user.id,
		user_updated: null,
		value: randomToken(),
		app_id: appId,
		scopes: JSON.stringify([ 'measurements' ]),
		type: 'access_token',
		parent: refreshTokenId,
	});
};

test('Tokens table', async ({ page, user }) => {
	await addToken(user);
	await page.goto('/tokens');
	await expect(page.locator('h1')).toHaveText('Tokens');

	// Validate token data is in table
	await expect(page.getByTestId('tokens-table').locator('tbody tr').first()).toContainText('e2e-test-existing-token');
	await expect(page.getByTestId('tokens-table').locator('tbody tr').first()).toContainText('https://globalping.io');
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
	await expect(page.getByTestId('tokens-table').locator('tbody tr').first()).toContainText('e2e-test-new-token');
	await expect(page.getByTestId('tokens-table').locator('tbody tr').first()).toContainText('https://www.jsdelivr.com');
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
	await expect(page.getByTestId('tokens-table').getByText('No data to show')).toBeVisible();
});

test('Applications table', async ({ page, user }) => {
	await addApplication(user);
	await page.goto('/tokens');
	await expect(page.locator('h2')).toHaveText('Authorized Apps');

	await page.pause();

	await expect(page.getByTestId('applications-table').locator('tbody tr').first()).toContainText('Auth Code App');
	await expect(page.getByTestId('applications-table').locator('tbody tr').first()).toContainText('Never');
});

test('Revoke application', async ({ page, user }) => {
	await addApplication(user);
	await page.goto('/tokens');

	await page.getByTestId('applications-table').getByLabel('Options').click();
	await page.getByLabel('Revoke access').locator('a').click();
	await page.getByRole('button', { name: 'Revoke access' }).click();

	await expect(page.getByTestId('applications-table').getByText('No data to show')).toBeVisible();
});


test('gp_tokens queries: the dashboard reads pass, anything that could reveal the value is rejected', async ({ user }) => {
	const api = await loginUser(user);

	const created = await api.post('/items/gp_tokens', {
		name: 'e2e-query-token',
		value: (await api.post('/bytes')).data.data,
		account_id: user.account_id,
	});
	expect(created.status).toBe(200);

	// The two reads the dashboard makes: the token list and its count.
	const list = await api.get(`/items/gp_tokens?filter[account_id][_eq]=${user.account_id}&filter[app_id][_null]=true&sort=-date_created&limit=10&offset=0`);
	expect(list.status).toBe(200);
	expect(list.data.data.map((token: { id: number }) => token.id)).toContain(created.data.data.id);
	expect(list.data.data[0].value).toBe('********');

	const count = await api.get(`/items/gp_tokens?aggregate[count]=*&filter[account_id][_eq]=${user.account_id}&filter[app_id][_null]=true`);
	expect(count.status).toBe(200);
	expect(Number(count.data.data[0].count)).toBe(1);

	// Filtering by id is what the Directus UI needs.
	expect((await api.get(`/items/gp_tokens?filter[id][_eq]=${created.data.data.id}`)).status).toBe(200);

	const rejected = [
		'aggregate[max]=value',
		'sort=value',
		'sort=-value',
		'sort=parent.value',
		'alias[v]=value',
		'groupBy[]=value',
		'filter[value][_eq]=anything',
		'filter[name][_eq]=e2e-query-token',
		'search=anything',
	];

	for (const query of rejected) {
		expect((await api.get(`/items/gp_tokens?${query}`)).status, query).toBe(400);
	}
});
