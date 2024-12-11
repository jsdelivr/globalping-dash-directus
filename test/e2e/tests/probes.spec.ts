import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomIP } from '../utils.ts';

const addData = async (user: User) => {
	const probeId = randomUUID();
	await sql('gp_adopted_probes').insert([{
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

test('Probes page', async ({ page, user }) => {
	await addData(user);
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
	await page.getByTestId('adoption-code').locator('input').first().fill('111111');
	await page.getByLabel('Verify the code').click();
	await page.getByLabel('Finish').click();
	await expect(page.getByText('probe-bf-ouagadougou-01').first()).toBeVisible();
});
