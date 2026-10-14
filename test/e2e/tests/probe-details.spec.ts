import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomIP } from '../utils.ts';

const probeDefaults = {
	asn: 16019,
	city: 'Prague',
	country: 'CZ',
	countryName: 'Czech Republic',
	continent: 'EU',
	continentName: 'Europe',
	region: 'Eastern Europe',
	latitude: 50.07,
	longitude: 14.42,
	state: null,
	name: 'e2e-details-probe',
	network: 'Vodafone Czech Republic a.s.',
	altIps: JSON.stringify([]),
	systemTags: JSON.stringify([ 'eyeball-network' ]),
	tags: JSON.stringify([]),
	status: 'ready',
	version: '0.28.0',
	nodeVersion: 'v22.22.3',
	allowedCountries: JSON.stringify([ 'CZ' ]),
	customLocation: null as string | null,
	originalLocation: null as string | null,
	settings: JSON.stringify({ meteredConnection: false }),
};

const addProbe = async (user: User, overrides: Partial<typeof probeDefaults> = {}) => {
	const probe = {
		...probeDefaults,
		...overrides,
		id: randomUUID(),
		uuid: randomUUID(),
		ip: randomIP(),
		userId: user.id,
		date_created: new Date(),
		lastSyncDate: new Date(),
	};

	await sql('gp_probes').insert(probe);
	return probe;
};

test('View probe details and return to the probe list', async ({ page, user }) => {
	const probe = await addProbe(user);

	await page.goto('/probes');
	await page.getByRole('link').filter({ hasText: probe.name }).first().click();
	await expect(page.getByRole('button', { name: 'Edit probe name' })).toContainText(probe.name);
	await expect(page.getByText(probe.ip, { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Go back to the list of probes' }).click();
	await expect(page.getByRole('heading', { name: 'Probes', exact: true })).toBeVisible();
	await expect(page.getByRole('link').filter({ hasText: probe.name }).first()).toBeVisible();
});

test('Rename a probe', async ({ page, user }) => {
	const probe = await addProbe(user);
	await page.goto(`/probes/${probe.id}`);
	await page.getByRole('button', { name: 'Edit probe name' }).click();
	await page.getByLabel('Probe name input').fill('Renamed probe');
	await page.getByRole('button', { name: 'Save probe name' }).click();
	await expect(page.getByRole('button', { name: 'Edit probe name' })).toContainText('Renamed probe');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Edit probe name' })).toContainText('Renamed probe');
});

test('Manage probe tags', async ({ page, user }) => {
	const probe = await addProbe(user);
	await page.goto(`/probes/${probe.id}`);
	await page.getByRole('button', { name: 'Open add tags dialog' }).click();
	await page.getByLabel('Your tag', { exact: true }).fill('home');
	await page.getByRole('button', { name: 'Save edited tags' }).click();
	await expect(page.getByText(`u-${user.github_username}:home`, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(`u-${user.github_username}:home`, { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Open edit tags dialog' }).click();
	await page.getByRole('button', { name: 'Remove tag', exact: true }).click();
	await page.getByRole('button', { name: 'Save edited tags' }).click();
	await expect(page.getByRole('button', { name: 'Open add tags dialog' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Open add tags dialog' })).toBeVisible();
	await expect(page.getByText(`u-${user.github_username}:home`, { exact: true })).not.toBeVisible();
});

test('Set a custom probe location', async ({ page, user }) => {
	const probe = await addProbe(user);
	await page.goto(`/probes/${probe.id}`);
	await expect(page.getByRole('combobox', { name: 'City name' })).toHaveValue('Prague');
	await page.getByRole('combobox', { name: 'City name' }).fill('Brno');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('The probe has been successfully updated', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('combobox', { name: 'City name' })).toHaveValue('Brno');
});

test('Reset a custom probe location', async ({ page, user }) => {
	const probe = await addProbe(user, {
		city: 'Brno',
		latitude: 49.2,
		longitude: 16.61,
		customLocation: JSON.stringify({ city: 'Brno', country: 'CZ', state: null, latitude: 49.2, longitude: 16.61 }),
		originalLocation: JSON.stringify({ city: 'Prague', country: 'CZ', state: null, latitude: 50.07, longitude: 14.42 }),
	});

	await page.goto(`/probes/${probe.id}`);
	await expect(page.getByRole('combobox', { name: 'City name' })).toHaveValue('Brno');
	await page.getByRole('combobox', { name: 'City name' }).fill('');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'City name' })).toHaveValue('Prague');
	await page.reload();
	await expect(page.getByRole('combobox', { name: 'City name' })).toHaveValue('Prague');
});

test('Save probe settings', async ({ page, user }) => {
	const probe = await addProbe(user);
	await page.goto(`/probes/${probe.id}`);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page.getByLabel('Metered connection').check();
	await page.getByRole('button', { name: 'Save settings' }).click();
	await expect(page.getByText('Probe settings have been successfully updated', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByLabel('Metered connection')).toBeChecked();
});

test('Restart a probe and view its logs', async ({ page, user }) => {
	const probe = await addProbe(user);
	await page.route('**/v1/probes/log-scopes', route => route.fulfill({ json: [] }));
	await page.route(`**/v1/probes/${probe.id}/restart`, route => route.fulfill({ status: 204 }));

	await page.route(`**/v1/probes/${probe.id}/logs**`, route => route.fulfill({
		json: {
			logs: [{ timestamp: '2024-07-03T09:46:40.000Z', scope: 'system', level: 'info', message: 'Probe started' }],
			firstId: '1',
			lastId: '1',
			hasOlder: false,
		},
	}));

	await page.goto(`/probes/${probe.id}`);
	await page.getByRole('button', { name: 'Restart probe' }).click();
	await expect(page.getByRole('region', { name: 'Probe logs' })).toContainText('Probe started');
});

test('Delete a probe', async ({ page, user }) => {
	const probe = await addProbe(user);

	try {
		await page.goto(`/probes/${probe.id}`);
		await page.getByRole('button', { name: 'Delete probe', exact: true }).click();
		await page.getByRole('dialog', { name: 'Delete probe', exact: true }).getByRole('button', { name: 'Delete probe', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Probes', exact: true })).toBeVisible();
		await expect(page.getByText('You don\'t have any probes yet.', { exact: true })).toBeVisible();
	} finally {
		// Fixture cleanup only finds adopted probes; this one now has no owner.
		await sql('gp_probes').where({ id: probe.id }).delete();
	}
});

test('A probe belonging to another user redirects to the probe list', async ({ page, user2 }) => {
	const probe = await addProbe(user2);
	await page.goto(`/probes/${probe.id}`);
	await expect(page).toHaveURL('/probes');
	await expect(page.getByRole('heading', { name: 'Probes', exact: true })).toBeVisible();
});
