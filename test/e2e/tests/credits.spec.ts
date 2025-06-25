import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';
import { randomIP } from '../utils.ts';

const addCredits = async (user: User) => {
	const probeId = randomUUID();
	const probeIP = randomIP();
	await sql('gp_probes').insert([{
		id: probeId,
		asn: 16019,
		city: 'Prague',
		country: 'CZ',
		date_created: '2024-02-22 11:02:12',
		date_updated: null,
		ip: probeIP,
		altIps: JSON.stringify([]),
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
		allowedCountries: JSON.stringify([ 'CZ' ]),
		customLocation: null,
	}]);

	await sql('gp_credits_additions').insert([{
		amount: 150,
		consumed: 1,
		date_created: relativeDayUtc(-1),
		github_id: user.external_identifier,
		user_updated: null,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probeId,
			ip: probeIP,
			name: 'e2e-credits-adopted-probe',
		}),
		adopted_probe: probeId,
	},
	{
		amount: 150,
		consumed: 1,
		date_created: relativeDayUtc(-1),
		github_id: user.external_identifier,
		user_updated: null,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probeId,
			ip: probeIP,
			name: 'e2e-credits-adopted-probe',
		}),
		adopted_probe: probeId,
	},
	{
		amount: 150,
		consumed: 1,
		date_created: relativeDayUtc(-2),
		github_id: user.external_identifier,
		user_updated: null,
		reason: 'adopted_probe',
		meta: JSON.stringify({
			id: probeId,
			ip: probeIP,
			name: 'e2e-credits-adopted-probe',
		}),
		adopted_probe: probeId,
	},
	{
		amount: 10000,
		consumed: 1,
		date_created: relativeDayUtc(-15),
		github_id: user.external_identifier,
		user_updated: null,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 50,
		}),
	},
	...[ -20, -50, -80, -110, -140, -170, -200 ].map(daysAgo => ({
		amount: 1000,
		consumed: 1,
		date_created: relativeDayUtc(daysAgo),
		github_id: user.external_identifier,
		user_updated: null,
		reason: 'recurring_sponsorship',
		meta: JSON.stringify({
			amountInDollars: 5,
		}),
	})) ]);

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: sql.raw('amount - ?', [ 6000 ]) });

	await sql('gp_credits_deductions').where({ user_id: user.id }).update({ date: relativeDayUtc(-10).toISOString().split('T')[0] });

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: sql.raw('amount - ?', [ 1000 ]) });
};

test.beforeEach(async ({ user }) => {
	await addCredits(user);
});

test('Credits page', async ({ page }) => {
	await page.goto('/credits');
	await expect(page.locator('h1')).toHaveText('Credits');
	await expect(page.getByTestId('total-credits')).toHaveText('10,450');
	await expect(page.getByTestId('generated-credits')).toHaveText('11,450');
	await expect(page.getByTestId('spent-credits')).toHaveText('7,000');
	await expect(page.getByTestId('estimated-credits')).toHaveText('150');
	await expect(page.locator('tbody')).toContainText('-1,000');
	await expect(page.locator('tbody')).toContainText('+300');
	await expect(page.locator('tbody')).toContainText('+150');
	await expect(page.locator('tbody')).toContainText('-6,000');
	await expect(page.locator('tbody')).toContainText('+10,000');
});

test('Second credits page is accessible', async ({ page }) => {
	await page.goto('/credits');
	await page.getByLabel('Page 2').click();
	await expect(page.getByText('Recurring $5 sponsorship.').first()).toBeVisible();
});
