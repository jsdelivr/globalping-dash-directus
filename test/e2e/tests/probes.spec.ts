import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { getUser, client as sql } from '../client.ts';

const addData = async () => {
	const user = await getUser();

	const probeId = randomUUID();
	await sql('gp_adopted_probes').insert([{
		id: probeId,
		asn: 16019,
		city: 'Prague',
		country: 'CZ',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: '1.1.1.1',
		altIps: JSON.stringify([]),
		isCustomCity: 0,
		lastSyncDate: new Date(),
		latitude: 50.0736,
		longitude: 14.4185,
		name: 'e2e-credits-adopted-probe',
		network: 'Vodafone Czech Republic a.s.',
		systemTags: JSON.stringify([ 'eyeball-network' ]),
		onlineTimesToday: 20,
		state: null,
		status: 'offline',
		tags: '[]',
		userId: user.id,
		uuid: 'b42c4319-6be3-46d4-8a01-d4558f0c070d',
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
		ip: '2a02:a319:80f3:8b80:344b:35ff:fee8:a8c',
		altIps: JSON.stringify([ '213.136.174.80' ]),
		isCustomCity: 1,
		lastSyncDate: new Date(),
		latitude: 40.85216,
		longitude: 14.26811,
		name: 'adopted-probe-2',
		network: 'IRIDEOS S.P.A.',
		onlineTimesToday: 120,
		state: null,
		status: 'ready',
		tags: JSON.stringify([{ value: 'tag-1', prefix: user.github_username }]),
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		userId: user.id,
		uuid: '681023cb-6aec-45a1-adde-e705c4043549',
		version: '0.28.0',
		hardwareDevice: null,
	}]);
};

test.beforeEach(async () => {
	await sql('gp_adopted_probes').delete();
});

test('Probes page', async ({ page }) => {
	await addData();
	await page.goto('/probes');
	await expect(page.locator('h1')).toHaveText('Probes');
	await expect(page.locator('tr')).toHaveCount(3);
});

test('Probe adoption', async ({ page }) => {
	await page.goto('/probes');
	await page.getByRole('button', { name: 'Adopt a probe' }).click();
	await page.getByLabel('Next step').click();
	await page.getByPlaceholder('Enter IP address of your probe').fill('2.2.2.2');
	await page.getByLabel('Send adoption code').click();
	await page.locator('input:nth-child(3)').fill('111111');
	await page.getByLabel('Verify the code').click();
	await page.getByLabel('Finish').click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});
