import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '@playwright/test';
import { getUser, client as sql } from './utils/client.ts';

const addData = async () => {
	const user = await getUser();

	const probeId = randomUUID();
	await sql('gp_adopted_probes').insert([{
		id: probeId,
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
		name: 'e2e-credits-adopted-probe',
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
	}, {
		id: randomUUID(),
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
		name: null,
		network: 'Vodafone Czech Republic a.s.',
		systemTags: JSON.stringify([ 'eyeball-network' ]),
		onlineTimesToday: 10,
		state: null,
		status: 'offline',
		tags: '[]',
		userId: user.id,
		uuid: 'b42c4319-6be3-46d4-8a01-d4558f0c070d',
		version: '0.28.0',
		hardwareDevice: null,
	}]);

	await sql('gp_credits_additions').insert([{
		amount: 150,
		comment: 'Adopted probe "e2e-credits-adopted-probe" (2a02:a319:80f3:8b80:344b:35ff:fee8:a8c).',
		consumed: 1,
		date_created: relativeDayUtc(-1),
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	},
	...[ -20, -50, -80 ].map(daysAgo => ({
		amount: 1000,
		comment: 'Recurring $5 sponsorship.',
		consumed: 1,
		date_created: relativeDayUtc(daysAgo),
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	})),
	]);

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: sql.raw('amount - ?', [ 1000 ]) });
};

test.beforeEach(async () => {
	await sql('gp_adopted_probes').delete();
	await sql('gp_credits_additions').delete();
	await sql('gp_credits').delete();
	await sql('gp_credits_deductions').delete();
	await addData();
});

test('Index page', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toHaveText('johndoe');
	await expect(page.locator('h1')).toHaveText('Overview');
	await expect(page.locator('#e2e_probes-count')).toHaveText('2');
	await expect(page.locator('#e2e_online-probes-count')).toHaveText('1');
	await expect(page.locator('#e2e_offline-probes-count')).toHaveText('1');
	await expect(page.locator('#e2e_total-credits')).toHaveText('2,150');
	await expect(page.locator('#e2e_credits-from-probes')).toHaveText('+300');
	await expect(page.locator('#e2e_credits-from-sponsorship')).toHaveText('+1,000');
});
