import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { clearUserData, client as sql } from '../client.ts';

const addData = async () => {
	const probeId = randomUUID();
	await sql('gp_adopted_probes').insert([{
		id: probeId,
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
		name: 'e2e-credits-adopted-probe',
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
		uuid: '55449b8a-bc30-432d-a2c6-15a9d8a04a4d',
		version: '0.28.0',
		hardwareDevice: null,
	}]);

	await sql('gp_credits_additions').insert([{
		amount: 150,
		comment: 'Adopted probe "e2e-credits-adopted-probe" (2a02:a319:80f3:8b80:6cc8:9d82:b5e:9f00).',
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
	await clearUserData();
	await addData();
});

test('Index page', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByLabel('Profile')).toHaveText('johndoe');
	await expect(page.locator('h1')).toHaveText('Overview');
	await expect(page.getByTestId('probes-count')).toHaveText('2');
	await expect(page.getByTestId('online-probes-count')).toHaveText('1');
	await expect(page.getByTestId('offline-probes-count')).toHaveText('1');
	await expect(page.getByTestId('total-credits')).toHaveText('2,150');
	await expect(page.getByTestId('credits-from-probes')).toHaveText('+300');
	await expect(page.getByTestId('credits-from-sponsorship')).toHaveText('+1,000');
});
