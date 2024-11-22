import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomIP } from '../utils.ts';

const addData = async (user: User) => {
	const probeId = randomUUID();
	const probeIP = randomIP();
	await sql('gp_adopted_probes').insert([{
		id: probeId,
		asn: 3302,
		city: 'Naples',
		country: 'IT',
		countryOfCustomCity: 'IT',
		date_created: '2024-02-22 11:04:30',
		date_updated: '2024-02-22 11:05:48',
		ip: probeIP,
		altIps: JSON.stringify([]),
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
		uuid: randomUUID(),
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
		ip: randomIP(),
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
		uuid: randomUUID(),
		version: '0.28.0',
		hardwareDevice: null,
	}]);

	await sql('gp_credits_additions').insert([{
		amount: 150,
		comment: `Adopted probe "e2e-credits-adopted-probe" (${probeIP}).`,
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

test.beforeEach(async ({ user }) => {
	await addData(user);
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
