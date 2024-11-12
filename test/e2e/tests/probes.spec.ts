import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { clearUserData, user, client as sql } from '../client.ts';

const addData = async () => {
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
		uuid: '55449b8a-bc30-432d-a2c6-15a9d8a04a4d',
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
		ip: '2a02:a319:80f3:8b80:6cc8:9d82:b5e:9f00',
		altIps: JSON.stringify([ '89.64.80.78' ]),
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
		uuid: '1a56565d-893d-432a-b33b-b7fe6576b3b1',
		version: '0.28.0',
		hardwareDevice: null,
	}]);
};

test.beforeEach(async () => {
	await clearUserData();
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
