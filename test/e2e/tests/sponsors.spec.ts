import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const unlinkedGithubId = `9${Math.floor(Math.random() * 100000000)}`;
const sponsorshipReasons = [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ];
const sponsorshipValueSql = `COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.amountInDollars')) AS DECIMAL(18,2)), 0)
	* CASE WHEN reason = 'recurring_sponsorship'
		THEN COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(meta, '$.monthsCovered')) AS UNSIGNED), 1)
		ELSE 1 END`;
let baseline: {
	active: number;
	monthly: number;
	previousValue: number;
	periodSponsors: number;
	periodValue: number;
	periodRecurring: number;
	periodOneTime: number;
	year2024Sponsors: number;
	year2024Value: number;
};
const previousMonthDate = (day: number) => {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, 12));
};

test.beforeEach(async ({ user, user2 }) => {
	const now = new Date();
	const pastYear = new Date(now);
	pastYear.setUTCFullYear(pastYear.getUTCFullYear() - 1);
	const previousFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
	const previousTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const [ overview, previous, period, year2024 ] = await Promise.all([
		sql('sponsors').count({ active: '*' }).sum({ monthly: 'monthly_amount' }).first(),
		sql('gp_credits_additions').whereIn('reason', sponsorshipReasons).where('date_created', '>=', previousFrom).where('date_created', '<', previousTo)
			.sum({ value: sql.raw(sponsorshipValueSql) }).first(),
		sql('gp_credits_additions').whereIn('reason', sponsorshipReasons).where('date_created', '>=', pastYear).where('date_created', '<', now)
			.countDistinct({ sponsors: 'github_id' }).sum({
				value: sql.raw(sponsorshipValueSql),
				recurring: sql.raw(`CASE WHEN reason IN ('recurring_sponsorship', 'tier_changed') THEN ${sponsorshipValueSql} ELSE 0 END`),
				oneTime: sql.raw(`CASE WHEN reason = 'one_time_sponsorship' THEN ${sponsorshipValueSql} ELSE 0 END`),
			}).first(),
		sql('gp_credits_additions').whereIn('reason', sponsorshipReasons).where('date_created', '>=', new Date('2024-01-01T00:00:00.000Z')).where('date_created', '<', new Date('2025-01-01T00:00:00.000Z'))
			.countDistinct({ sponsors: 'github_id' }).sum({ value: sql.raw(sponsorshipValueSql) }).first(),
	]);
	baseline = {
		active: Number(overview?.active || 0),
		monthly: Number(overview?.monthly || 0),
		previousValue: Number(previous?.value || 0),
		periodSponsors: Number(period?.sponsors || 0),
		periodValue: Number(period?.value || 0),
		periodRecurring: Number(period?.recurring || 0),
		periodOneTime: Number(period?.oneTime || 0),
		year2024Sponsors: Number(year2024?.sponsors || 0),
		year2024Value: Number(year2024?.value || 0),
	};

	await sql('sponsors').insert({
		github_id: user.external_identifier,
		github_login: user.github_username,
		monthly_amount: 10,
		last_earning_date: previousMonthDate(1),
	});

	const additions = [
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 120000, dollars: 10, months: 3 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'tier_changed', amount: 20000, dollars: 5 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user.external_identifier, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
		{ github_id: user2.external_identifier, reason: 'recurring_sponsorship', amount: 80000, dollars: 20 },
		{ github_id: user2.external_identifier, reason: 'recurring_sponsorship', amount: 80000, dollars: 20 },
		{ github_id: user2.external_identifier, reason: 'recurring_sponsorship', amount: 80000, dollars: 20 },
		{ github_id: unlinkedGithubId, reason: 'one_time_sponsorship', amount: 200000, dollars: 50 },
	];

	await sql('gp_credits_additions').insert(additions.map((addition, index) => ({
		amount: addition.amount,
		consumed: 1,
		date_created: previousMonthDate(index + 1),
		github_id: addition.github_id,
		user_updated: null,
		reason: addition.reason,
		meta: JSON.stringify({
			amountInDollars: addition.dollars,
			...addition.months && { monthsCovered: addition.months },
			bonus: 0,
		}),
		adopted_probe: null,
	})));

	await sql('gp_credits_additions').insert({
		amount: 100000,
		consumed: 1,
		date_created: new Date('2024-06-15T12:00:00.000Z'),
		github_id: unlinkedGithubId,
		user_updated: null,
		reason: 'one_time_sponsorship',
		meta: JSON.stringify({ amountInDollars: 25, bonus: 0 }),
		adopted_probe: null,
	});
});

test.afterEach(async () => {
	await sql('gp_credits_additions').where({ github_id: unlinkedGithubId }).delete();
});

test('Sponsors page', async ({ page, adminPage, user, user2 }) => {
	for (const route of [ 'summary', 'events', 'accounts', 'manual-additions' ]) {
		const response = await page.request.get(`${process.env.DIRECTUS_URL}/admin-sponsors/${route}`);
		expect(response.status()).toBe(403);
	}

	await adminPage.goto('/sponsors');
	await expect(adminPage.getByRole('heading', { name: 'Sponsors', exact: true })).toBeVisible();
	await expect(adminPage.getByRole('link', { name: 'Sponsors' })).toBeVisible();
	const formatMoney = (value: number) => `$${new Intl.NumberFormat('en-US').format(value)}`;
	await expect(adminPage.getByTestId('active-sponsors')).toHaveText(String(baseline.active + 1));
	await expect(adminPage.getByTestId('previous-month-value')).toHaveText(formatMoney(baseline.previousValue + 235));
	await expect(adminPage.getByTestId('next-month-value')).toHaveText(formatMoney(baseline.monthly + 10));
	await expect(adminPage.getByTestId('period-sponsors')).toHaveText(String(baseline.periodSponsors + 3));
	await expect(adminPage.getByTestId('period-value')).toHaveText(formatMoney(baseline.periodValue + 235));
	await expect(adminPage.getByText(`${formatMoney(baseline.periodRecurring + 185)} recurring · ${formatMoney(baseline.periodOneTime + 50)} one-time`, { exact: true })).toBeVisible();
	await expect(adminPage.getByText('Credits issued', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByText('Bonus', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByText('Sponsors credited', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByLabel('Monthly recurring and one-time sponsorship amounts')).toBeVisible();
	const eventsTable = adminPage.getByRole('heading', { name: 'Sponsorship events' }).locator('xpath=ancestor::section[1]');
	const eventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes('search='));
	await adminPage.getByLabel('Search sponsorship events').fill(user.external_identifier);
	await eventsResponse;
	await expect(eventsTable.locator('tbody tr')).toHaveCount(10);
	await eventsTable.getByLabel('Page 2').click();
	await expect(eventsTable.locator('tbody tr')).toHaveCount(1);

	let filteredEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes(`search=${unlinkedGithubId}`));
	await adminPage.getByLabel('Search sponsorship events').fill(unlinkedGithubId);
	await filteredEventsResponse;
	await expect(eventsTable.locator('tbody tr')).toHaveCount(1);
	await expect(eventsTable.locator('tbody tr').first()).toContainText(unlinkedGithubId);
	await eventsTable.getByRole('button', { name: 'Filters' }).click();
	await adminPage.getByRole('combobox', { name: 'Event types' }).click();
	filteredEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes('types=one_time_sponsorship'));
	await adminPage.getByRole('option', { name: 'One-time sponsorship' }).click();
	await filteredEventsResponse;
	await expect(eventsTable.locator('tbody tr')).toHaveCount(1);
	await expect(eventsTable.locator('tbody tr').first()).toContainText(formatMoney(50));
	await adminPage.getByRole('combobox', { name: 'Event types' }).click();
	const resetEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && !response.url().includes('types='));
	await adminPage.getByRole('option', { name: 'All', exact: true }).click();
	await resetEventsResponse;

	const searchedEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes(`search=${user.external_identifier}`));
	await adminPage.getByLabel('Search sponsorship events').fill(user.external_identifier);
	await searchedEventsResponse;
	let sortedEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes('sort=sponsorshipValue') && response.url().includes('direction=asc'));
	await eventsTable.getByRole('columnheader', { name: 'Sponsorship amount' }).click();
	await sortedEventsResponse;
	await expect(eventsTable.locator('tbody tr').first()).toContainText(formatMoney(5));
	await expect(adminPage).toHaveURL(/sponsorEventsSort=sponsorshipValue/);
	await expect(adminPage).toHaveURL(/sponsorEventsDirection=asc/);
	sortedEventsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes('sort=sponsorshipValue') && response.url().includes('direction=desc'));
	await eventsTable.getByRole('columnheader', { name: 'Sponsorship amount' }).click();
	await sortedEventsResponse;
	await expect(eventsTable.locator('tbody tr').first()).toContainText(formatMoney(30));

	const accountsTable = adminPage.getByRole('heading', { name: 'Sponsor accounts' }).locator('xpath=ancestor::section[1]');
	let accountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes(`search=${user.external_identifier}`));
	await adminPage.getByLabel('Search sponsor accounts').fill(user.external_identifier);
	await accountsResponse;
	await expect(accountsTable.locator('tbody tr')).toHaveCount(1);
	await expect(accountsTable.locator('tbody tr').first()).toContainText('Active recurring');
	accountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes(`search=${user2.external_identifier}`));
	await adminPage.getByLabel('Search sponsor accounts').fill(user2.external_identifier);
	await accountsResponse;
	await expect(accountsTable.locator('tbody tr').first()).toContainText('Former recurring');
	await expect(accountsTable.locator('tbody tr').first().getByRole('link', { name: user2.github_username })).toBeVisible();
	accountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes(`search=${unlinkedGithubId}`));
	await adminPage.getByLabel('Search sponsor accounts').fill(unlinkedGithubId);
	await accountsResponse;
	await expect(accountsTable.locator('tbody tr').first()).toContainText('One-time only');
	await adminPage.getByRole('heading', { name: 'Sponsor accounts' }).evaluate(element => element.scrollIntoView({ block: 'center' }));
	await accountsTable.getByRole('button', { name: 'Filters' }).click();
	const accountFilters = adminPage.getByRole('dialog').filter({ has: adminPage.getByRole('heading', { name: 'Filter sponsor accounts' }) });
	await expect(accountFilters).toBeVisible();
	await accountFilters.getByRole('combobox', { name: 'Sponsor statuses' }).click();
	await expect(adminPage.getByRole('option', { name: 'One-time only' })).toBeVisible();
	accountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes('statuses=one-time'));
	await adminPage.getByRole('option', { name: 'One-time only' }).click();
	await accountsResponse;
	await expect(accountsTable.locator('tbody tr')).toHaveCount(1);
	await adminPage.getByRole('combobox', { name: 'Dashboard account linkage' }).click();
	accountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes('linked=false'));
	await adminPage.getByRole('option', { name: 'Not linked' }).click();
	await accountsResponse;
	await expect(accountsTable.locator('tbody tr')).toHaveCount(1);
	const sortedAccountsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes('sort=periodValue') && response.url().includes('direction=asc'));
	await accountsTable.getByRole('columnheader', { name: 'Period amount' }).click();
	await sortedAccountsResponse;
	await expect(adminPage).toHaveURL(/sponsorAccountsSort=periodValue/);
	await expect(adminPage).toHaveURL(/sponsorAccountsDirection=asc/);

	await adminPage.getByLabel('Sponsorship period').click();
	await adminPage.getByRole('option', { name: '2024' }).click();
	await expect(adminPage.getByTestId('period-sponsors')).toHaveText(String(baseline.year2024Sponsors + 1));
	await expect(adminPage.getByTestId('period-value')).toHaveText(formatMoney(baseline.year2024Value + 25));

	await adminPage.getByRole('button', { name: 'Manual additions' }).click();
	const manualAdditionsDialog = adminPage.getByRole('dialog', { name: 'Manual additions' });
	await expect(manualAdditionsDialog).toBeVisible();
	const manualAdditionsRows = manualAdditionsDialog.locator('tbody tr');
	await expect(manualAdditionsRows.first()).toContainText('Manual one-time payment');
	await expect(manualAdditionsRows.nth(1)).toContainText('Other credits');
	await expect(manualAdditionsDialog.locator('tbody').getByText('Admin User', { exact: true })).toHaveCount(10);
	await expect(manualAdditionsDialog.getByRole('button', { name: 'Page 2' })).toBeVisible();
	const sortedManualAdditionsResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/manual-additions') && response.url().includes('sort=credits') && response.url().includes('direction=asc'));
	await manualAdditionsDialog.getByRole('columnheader', { name: 'Credits' }).click();
	await sortedManualAdditionsResponse;
	await expect(adminPage).toHaveURL(/manualAdditionsSort=credits/);
	await expect(adminPage).toHaveURL(/manualAdditionsDirection=asc/);
	await manualAdditionsDialog.getByRole('button', { name: 'Close' }).click();

	await adminPage.getByRole('button', { name: 'Add credits' }).click();
	await expect(adminPage.getByRole('dialog', { name: 'Add credits' })).toBeVisible();
	await adminPage.getByRole('button', { name: 'Close' }).click();
	await expect(adminPage.getByRole('button', { name: 'Add credits' })).toBeFocused();
});
