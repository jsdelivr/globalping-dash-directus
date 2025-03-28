import { randomUUID } from 'node:crypto';
import axios from 'axios';
import _ from 'lodash';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomIP } from '../utils.ts';

test.afterEach(async () => {
	await sql('gp_probes').where({ ip: '2.2.2.2' }).delete();
});

const addUserProbes = async (user: User) => {
	const probeId = randomUUID();
	await sql('gp_probes').insert([{
		id: probeId,
		asn: 16019,
		city: 'Prague',
		country: 'CZ',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: randomIP(),
		altIps: JSON.stringify([]),
		isCustomCity: 0,
		lastSyncDate: new Date(),
		latitude: 50.07,
		longitude: 14.42,
		name: 'e2e-credits-adopted-probe',
		network: 'Vodafone Czech Republic a.s.',
		systemTags: JSON.stringify([ 'eyeball-network' ]),
		onlineTimesToday: 20,
		state: null,
		status: 'offline',
		tags: '[]',
		userId: user.id,
		uuid: randomUUID(),
		version: '0.28.0',
		hardwareDevice: null,
	}, {
		id: randomUUID(),
		asn: 3302,
		city: 'Naples',
		country: 'IT',
		countryOfCustomCity: 'IT',
		date_created: '2024-02-22 11:04:30',
		date_updated: '2024-02-22 11:05:48',
		ip: randomIP(),
		altIps: JSON.stringify([ '89.64.80.78' ]),
		isCustomCity: 1,
		lastSyncDate: new Date(),
		latitude: 40.85,
		longitude: 14.27,
		name: 'adopted-probe-2',
		network: 'IRIDEOS S.P.A.',
		onlineTimesToday: 120,
		state: null,
		status: 'ready',
		tags: JSON.stringify([{ value: 'tag-1', prefix: user.github_username }]),
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		userId: user.id,
		uuid: randomUUID(),
		version: '0.28.0',
		hardwareDevice: null,
	}]);
};

const defaultProbe = {
	id: randomUUID(),
	ip: '2.2.2.2',
	uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8',
	name: null,
	asn: 3302,
	city: 'Ouagadougou',
	country: 'BF',
	date_created: new Date(),
	isCustomCity: 0,
	lastSyncDate: new Date(),
	latitude: 12.37,
	longitude: -1.53,
	network: 'IRIDEOS S.P.A.',
	onlineTimesToday: 50,
	state: null,
	status: 'ready',
	userId: null,
	version: '0.28.0',
	hardwareDevice: null,
};

const addProbeWithoutUser = async () => {
	await sql('gp_probes').insert(defaultProbe);
	return defaultProbe;
};

const addProbeWithUser = async (user2: User) => {
	await sql('gp_probes').insert({
		...defaultProbe,
		userId: user2.id,
	});
};

const addOfflineProbeWithSameAsn = async (user: User) => {
	await sql('gp_probes').insert({
		...defaultProbe,
		name: 'probe-bf-ouagadougou-01',
		ip: '1.1.1.1',
		uuid: 'outdatedUuid',
		status: 'offline',
		userId: user.id,
	});
};

test('Probes page', async ({ page, user }) => {
	await addUserProbes(user);
	await page.goto('/probes');
	await expect(page.locator('h1')).toHaveText('Probes');
	await expect(page.locator('tr')).toHaveCount(3);
});

test('Software probe adoption (token)', async ({ page, user }) => {
	const probe = await addProbeWithoutUser();
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByRole('button', { name: 'Software probe' }).click();
	await page.getByRole('button', { name: 'Next step' }).click();

	await axios.put(`${process.env.DIRECTUS_URL}/adoption-code/adopt-by-token`, {
		probe: _.omit(probe, 'id'),
		user: { id: user.id },
	}, {
		headers: {
			'X-Api-Key': 'system',
		},
	});

	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});

test('Software probe adoption by asn/city', async ({ page, user }) => {
	await addOfflineProbeWithSameAsn(user);
	await page.goto('/probes');
	await expect(page.locator('tr')).toHaveCount(2);
	await expect(page.getByText('1.1.1.1').first()).toBeVisible();

	await axios.put(`${process.env.DIRECTUS_URL}/adoption-code/adopt-by-token`, {
		probe: _.omit(defaultProbe, 'id'),
		user: { id: user.id },
	}, {
		headers: {
			'X-Api-Key': 'system',
		},
	});

	await page.goto('/probes');
	await expect(page.locator('tr')).toHaveCount(2);
	await expect(page.getByText('2.2.2.2').first()).toBeVisible();
});

test('Software probe adoption (code)', async ({ page }) => {
	await addProbeWithoutUser();
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByRole('button', { name: 'Software probe' }).click();
	await page.getByRole('button', { name: 'Next step' }).click();
	await page.waitForTimeout(10000);
	await page.getByLabel('Adopt the probe manually').click();
	await page.getByPlaceholder('Enter IP address of your probe').fill('2.2.2.2');
	await page.getByLabel('Send adoption code').click();
	await page.getByTestId('adoption-code').locator('input').first().fill('111111');
	await page.getByLabel('Verify the code').click();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});

test('Hardware probe adoption', async ({ page }) => {
	await addProbeWithoutUser();
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByRole('button', { name: 'Hardware probe' }).click();
	await page.getByRole('button', { name: 'Next step' }).click();
	await page.getByPlaceholder('Enter IP address of your probe').fill('2.2.2.2');
	await page.getByLabel('Send adoption code').click();
	await page.getByTestId('adoption-code').locator('input').first().fill('111111');
	await page.getByLabel('Verify the code').click();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});

test('Probe adoption of non-synced probe', async ({ page }) => {
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByRole('button', { name: 'Hardware probe' }).click();
	await page.getByRole('button', { name: 'Next step' }).click();
	await page.getByPlaceholder('Enter IP address of your probe').fill('2.2.2.2');
	await page.getByLabel('Send adoption code').click();
	await page.getByTestId('adoption-code').locator('input').first().fill('111111');
	await page.getByLabel('Verify the code').click();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});

test('Probe adoption by code fails if probe is already adopted', async ({ page, user2 }) => {
	await addProbeWithUser(user2);
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByRole('button', { name: 'Hardware probe' }).click();
	await page.getByRole('button', { name: 'Next step' }).click();
	await page.getByPlaceholder('Enter IP address of your probe').fill('2.2.2.2');
	await page.getByLabel('Send adoption code').click();
	await expect(page.getByText('The probe with this IP address is already adopted').first()).toBeVisible();
});
