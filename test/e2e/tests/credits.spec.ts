import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { User, randomIP, client as sql } from '../client.ts';

const addCredits = async (user: User) => {
	const probeId = randomUUID();
	const probeIP = randomIP();
	await sql('gp_adopted_probes').insert([{
		id: probeId,
		asn: 16019,
		city: 'Prague',
		country: 'CZ',
		countryOfCustomCity: null,
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: probeIP,
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
	{
		amount: 150,
		comment: `Adopted probe "e2e-credits-adopted-probe" (${probeIP}).`,
		consumed: 1,
		date_created: relativeDayUtc(-2),
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: probeId,
	},
	{
		amount: 10000,
		comment: 'One-time $50 sponsorship.',
		consumed: 1,
		date_created: relativeDayUtc(-15),
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	},
	...[ -20, -50, -80, -110, -140, -170, -200 ].map(daysAgo => ({
		amount: 1000,
		comment: 'Recurring $5 sponsorship.',
		consumed: 1,
		date_created: relativeDayUtc(daysAgo),
		github_id: user.external_identifier,
		user_updated: null,
		adopted_probe: null,
	})),
	]);

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: sql.raw('amount - ?', [ 6000 ]) });

	await sql('gp_credits_deductions').where({ user_id: user.id }).update({ date: relativeDayUtc(-10).toISOString().split('T')[0] });

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: sql.raw('amount - ?', [ 1000 ]) });
};

test.beforeEach(async ({ user }) => {
	await addCredits(user);
});

test('Credits page', async ({ page }) => {
	await page.goto('/credits');
	await expect(page.getByTestId('total-credits')).toHaveText('10,300');
	await expect(page.getByTestId('generated-credits')).toHaveText('11,300');
	await expect(page.getByTestId('spent-credits')).toHaveText('7,000');
	await expect(page.getByTestId('estimated-credits')).toHaveText('150');
});

test('Second credits page is accessible', async ({ page }) => {
	await page.goto('http://localhost:13010/credits');
	await page.getByLabel('Page 2').click();
	await expect(page.getByText('Recurring $5 sponsorship.').first()).toBeVisible();
});
