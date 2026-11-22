import { randomUUID } from 'node:crypto';
import { test, expect, type APIRequestContext } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { loginDirectusAdmin, loginUser } from '../utils.ts';
import type { ManualAddition, PageResult, SponsorAccount, SponsorsSummary, SponsorshipEvent } from '../../../src/extensions/endpoints/admin-sponsors/src/types.ts';

const unlinkedGithubId = `9${Math.floor(Math.random() * 100000000)}`;
const redirectSourceGithubId = '900000000001';
const redirectTargetGithubId = '900000000002';
const sponsorshipReasons = [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ];
const sponsorGithubIdSql = `COALESCE(JSON_VALUE(meta, '$.sponsorGithubId'), github_id)`;
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

test.beforeEach(async ({ user, user2, org }) => {
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
			.countDistinct({ sponsors: sql.raw(sponsorGithubIdSql) }).sum({
				value: sql.raw(sponsorshipValueSql),
				recurring: sql.raw(`CASE WHEN reason IN ('recurring_sponsorship', 'tier_changed') THEN ${sponsorshipValueSql} ELSE 0 END`),
				oneTime: sql.raw(`CASE WHEN reason = 'one_time_sponsorship' THEN ${sponsorshipValueSql} ELSE 0 END`),
			}).first(),
		sql('gp_credits_additions').whereIn('reason', sponsorshipReasons).where('date_created', '>=', new Date('2024-01-01T00:00:00.000Z')).where('date_created', '<', new Date('2025-01-01T00:00:00.000Z'))
			.countDistinct({ sponsors: sql.raw(sponsorGithubIdSql) }).sum({ value: sql.raw(sponsorshipValueSql) }).first(),
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
		// An org sponsor: linked to the dashboard through the org, not through a user.
		{ github_id: org.github_id, reason: 'recurring_sponsorship', amount: 40000, dollars: 10 },
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

	await sql('gp_credits_additions').insert({
		amount: 10000,
		consumed: 1,
		date_created: new Date('2025-01-10T12:00:00.000Z'),
		github_id: org.github_id,
		user_updated: null,
		reason: 'other',
		meta: JSON.stringify({ manual: true, comment: 'Org bonus' }),
		adopted_probe: null,
	});
});

test.afterEach(async ({ org }) => {
	await sql('gp_credits_additions').whereIn('github_id', [ unlinkedGithubId, redirectSourceGithubId, redirectTargetGithubId, org.github_id ]).delete();
	await sql('sponsors').where({ github_id: redirectSourceGithubId }).delete();
	await sql('gp_credits_redirects').where({ source_github_id: redirectSourceGithubId }).delete();
});

const readSponsorsPage = async <T>(request: APIRequestContext, route: string, params: Record<string, string | number | boolean> = {}): Promise<PageResult<T>> => {
	const response = await request.get(`${process.env.DIRECTUS_URL}/admin-sponsors/${route}`, { params });
	expect(response.status()).toBe(200);
	return response.json() as Promise<PageResult<T>>;
};

test('Sponsors page totals', { tag: '@sequential' }, async () => {
	const admin = await loginDirectusAdmin();
	const recent = await admin.get<SponsorsSummary>('/admin-sponsors/summary', { params: { period: 'past-year' } });
	expect(recent.status).toBe(200);
	expect(recent.data.overview.activeSponsors).toBe(baseline.active + 1);
	expect(recent.data.overview.previousMonth.totalValue).toBe(baseline.previousValue + 245);
	expect(recent.data.overview.estimatedNextMonthValue).toBe(baseline.monthly + 10);

	expect(recent.data.period).toEqual({
		sponsors: baseline.periodSponsors + 4,
		sponsorshipValue: baseline.periodValue + 245,
		recurringValue: baseline.periodRecurring + 195,
		oneTimeValue: baseline.periodOneTime + 50,
	});

	const year2024 = await admin.get<SponsorsSummary>('/admin-sponsors/summary', { params: { period: '2024' } });
	expect(year2024.status).toBe(200);
	expect(year2024.data.period.sponsors).toBe(baseline.year2024Sponsors + 1);
	expect(year2024.data.period.sponsorshipValue).toBe(baseline.year2024Value + 25);
});

test('Sponsors page', async ({ adminPage, user, user2, org }) => {
	const regularUser = await loginUser(user);

	for (const route of [ 'summary', 'events', 'accounts', 'manual-additions' ]) {
		expect((await regularUser.get(`/admin-sponsors/${route}`)).status).toBe(403);
	}

	const events = (params: Record<string, string | number>) => readSponsorsPage<SponsorshipEvent>(adminPage.request, 'events', params);
	const accounts = (params: Record<string, string | number | boolean>) => readSponsorsPage<SponsorAccount>(adminPage.request, 'accounts', params);
	const manualAdditions = (params?: Record<string, string>) => readSponsorsPage<ManualAddition>(adminPage.request, 'manual-additions', params);

	const firstPage = await events({ search: user.external_identifier });
	expect(firstPage.total).toBe(11);
	expect(firstPage.items).toHaveLength(10);
	const secondPage = await events({ search: user.external_identifier, offset: 10 });
	expect(secondPage.items).toHaveLength(1);
	expect(firstPage.items.map(event => event.id)).not.toContain(secondPage.items[0]!.id);

	const orgEvents = await events({ search: org.github_id });
	expect(orgEvents.items).toEqual([ expect.objectContaining({ githubId: org.github_id, dashboardAccountName: org.name }) ]);
	const oneTimeEvents = await events({ search: unlinkedGithubId, types: 'one_time_sponsorship' });
	expect(oneTimeEvents.items).toEqual([ expect.objectContaining({ githubId: unlinkedGithubId, reason: 'one_time_sponsorship', sponsorshipValue: 50 }) ]);
	const tierChanges = await events({ search: user.external_identifier, types: 'tier_changed' });
	expect(tierChanges.items).toEqual([ expect.objectContaining({ githubId: user.external_identifier, reason: 'tier_changed', sponsorshipValue: 5 }) ]);
	const amounts = { search: user.external_identifier, sort: 'sponsorshipValue' };
	expect((await events({ ...amounts, direction: 'asc' })).items[0]!.sponsorshipValue).toBe(5);
	expect((await events({ ...amounts, direction: 'desc' })).items[0]!.sponsorshipValue).toBe(30);

	expect((await accounts({ search: user.external_identifier })).items).toEqual([ expect.objectContaining({ githubId: user.external_identifier, status: 'active' }) ]);
	expect((await accounts({ search: user2.external_identifier })).items).toEqual([ expect.objectContaining({ githubId: user2.external_identifier, status: 'former', dashboardAccountName: user2.github_username }) ]);
	expect((await accounts({ search: org.github_id })).items).toEqual([ expect.objectContaining({ githubId: org.github_id, dashboardAccountName: org.name }) ]);
	expect((await accounts({ search: unlinkedGithubId, statuses: 'one-time', linked: false })).items).toEqual([ expect.objectContaining({ githubId: unlinkedGithubId, status: 'one-time', dashboardAccountId: null }) ]);

	const oneTimeAccounts = await accounts({ statuses: 'one-time', limit: 100 });
	expect(oneTimeAccounts.items.map(account => account.githubId)).toContain(unlinkedGithubId);
	expect(oneTimeAccounts.items.map(account => account.githubId)).not.toContain(user.external_identifier);
	const unlinkedAccounts = await accounts({ linked: false, limit: 100 });
	expect(unlinkedAccounts.items.map(account => account.githubId)).toContain(unlinkedGithubId);
	expect(unlinkedAccounts.items.map(account => account.githubId)).not.toContain(org.github_id);

	const sortedAccounts = await accounts({ sort: 'periodValue', direction: 'asc' });
	const periodValues = sortedAccounts.items.map(account => account.periodSponsorshipValue);
	expect(periodValues.length).toBeGreaterThan(1);
	expect(periodValues).toEqual([ ...periodValues ].sort((a, b) => a - b));

	const additions = await manualAdditions();
	expect(additions.items).toHaveLength(10);
	expect(additions.total).toBeGreaterThan(10);
	expect(additions.items[0]!.type).toBe('payment');
	expect(additions.items[1]!.type).toBe('other');
	expect(additions.items.map(addition => addition.addedBy)).toEqual(Array(10).fill('Admin User'));
	expect((await manualAdditions({ search: org.github_id })).items).toEqual([ expect.objectContaining({ comment: 'Org bonus', dashboardAccountName: org.name }) ]);
	const sortedAdditions = await manualAdditions({ sort: 'credits', direction: 'asc' });
	const creditAmounts = sortedAdditions.items.map(addition => addition.credits);
	expect(creditAmounts).toEqual([ ...creditAmounts ].sort((a, b) => a - b));

	const summaryResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/summary?period=past-year') && response.ok());
	await adminPage.goto('/sponsors');
	await expect(adminPage.getByRole('heading', { name: 'Sponsors', exact: true })).toBeVisible();

	const response = await summaryResponse;
	const currentSummary = await response.json() as SponsorsSummary;
	const formatMoney = (value: number) => `$${new Intl.NumberFormat('en-US').format(value)}`;
	await expect(adminPage.getByTestId('active-sponsors')).toHaveText(String(currentSummary.overview.activeSponsors));
	await expect(adminPage.getByTestId('previous-month-value')).toHaveText(formatMoney(currentSummary.overview.previousMonth.totalValue));
	await expect(adminPage.getByTestId('next-month-value')).toHaveText(formatMoney(currentSummary.overview.estimatedNextMonthValue));
	await expect(adminPage.getByTestId('period-sponsors')).toHaveText(String(currentSummary.period.sponsors));
	await expect(adminPage.getByTestId('period-value')).toHaveText(formatMoney(currentSummary.period.sponsorshipValue));
	await expect(adminPage.getByText(`${formatMoney(currentSummary.period.recurringValue)} recurring · ${formatMoney(currentSummary.period.oneTimeValue)} one-time`, { exact: true })).toBeVisible();
	await expect(adminPage.getByRole('link', { name: 'Sponsors' })).toBeVisible();
	await expect(adminPage.getByText('Credits issued', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByText('Bonus', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByText('Sponsors credited', { exact: true })).toHaveCount(0);
	await expect(adminPage.getByLabel('Monthly recurring and one-time sponsorship amounts')).toBeVisible();

	const eventsTable = adminPage.getByRole('heading', { name: 'Sponsorship events' }).locator('xpath=ancestor::section[1]');
	const eventsSearch = adminPage.getByLabel('Search sponsorship events');
	const firstEventsPage = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/events') && response.url().includes(`search=${user.external_identifier}`));
	await eventsSearch.fill(user.external_identifier);
	await firstEventsPage;
	await expect(eventsTable.locator('tbody tr')).toHaveCount(10);
	await eventsTable.getByLabel('Page 2').click();
	await expect(eventsTable.locator('tbody tr')).toHaveCount(1);
	await expect(eventsTable.locator('tbody tr').first()).toContainText(formatMoney(secondPage.items[0]!.sponsorshipValue));

	await eventsSearch.fill(org.github_id);
	await expect(eventsTable.locator('tbody tr')).toHaveCount(1);
	await expect(eventsTable.getByRole('link', { name: org.name })).toBeVisible();
	await expect(eventsTable.locator('tbody tr').first().getByLabel('Dashboard account linked')).toBeVisible();
	await eventsTable.getByRole('columnheader', { name: 'Sponsorship amount' }).click();
	await expect(adminPage).toHaveURL(/eventsSort=sponsorshipValue/);
	await expect(adminPage).toHaveURL(/eventsOrder=asc/);

	const accountsTable = adminPage.getByRole('heading', { name: 'Sponsor accounts' }).locator('xpath=ancestor::section[1]');
	const account = accountsTable.locator('tbody tr').filter({ hasText: unlinkedGithubId });
	await adminPage.getByLabel('Search sponsor accounts').fill(unlinkedGithubId);
	await expect(account).toBeVisible();
	await adminPage.getByRole('heading', { name: 'Sponsor accounts' }).evaluate(element => element.scrollIntoView({ block: 'center' }));
	await accountsTable.getByRole('button', { name: 'Filters' }).click();

	const accountFilters = adminPage.getByRole('dialog', { name: 'Filter sponsor accounts' });
	await accountFilters.getByRole('combobox', { name: 'Sponsor statuses' }).click();
	const statusResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes('statuses=one-time'));
	await adminPage.getByRole('option', { name: 'One-time only' }).click();
	await statusResponse;
	await expect(account).toContainText('One-time only');

	await accountFilters.getByRole('combobox', { name: 'Dashboard account linkage' }).click();
	const linkageResponse = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/accounts') && response.url().includes('linked=true'));
	await adminPage.getByRole('option', { name: 'Linked', exact: true }).click();
	await linkageResponse;
	await expect(accountsTable.locator('tbody').getByText('No results match the current filters', { exact: true })).toBeVisible();

	await adminPage.getByRole('button', { name: 'Manual additions' }).click();
	const manualAdditionsDialog = adminPage.getByRole('dialog', { name: 'Manual additions' });
	await expect(manualAdditionsDialog).toBeVisible();
	await expect(manualAdditionsDialog.getByRole('button', { name: 'Page 2' })).toBeVisible();
	await manualAdditionsDialog.getByRole('button', { name: 'Close' }).click();

	await adminPage.getByRole('button', { name: 'Add credits' }).click();
	await expect(adminPage.getByRole('dialog', { name: 'Add credits' })).toBeVisible();
	await adminPage.getByRole('button', { name: 'Close' }).click();
	await expect(adminPage.getByRole('button', { name: 'Add credits' })).toBeFocused();

	await adminPage.getByLabel('Sponsorship period').click();
	const pastSummary = adminPage.waitForResponse('**/admin-sponsors/summary?period=2024');
	await adminPage.getByRole('option', { name: '2024' }).click();
	const historicalSummary = await (await pastSummary).json() as SponsorsSummary;
	await expect(adminPage.getByTestId('period-value')).toHaveText(formatMoney(historicalSummary.period.sponsorshipValue));
});


test('Redirected sponsorship history', async ({ adminPage, user2 }) => {
	await sql('directus_users').where({ id: user2.id }).update({ external_identifier: redirectTargetGithubId, github_username: 'redirect-target' });
	await sql('gp_credits_redirects').insert({ id: randomUUID(), source_github_id: redirectSourceGithubId, target_github_id: redirectTargetGithubId });

	await sql('sponsors').insert({
		github_id: redirectSourceGithubId,
		github_login: 'redirect-source',
		monthly_amount: 30,
		last_earning_date: previousMonthDate(1),
	});

	await sql('gp_credits_additions').insert({
		amount: 120000,
		consumed: 1,
		date_created: previousMonthDate(1),
		github_id: redirectTargetGithubId,
		user_updated: null,
		reason: 'recurring_sponsorship',
		meta: JSON.stringify({ amountInDollars: 30, bonus: 0, sponsorGithubId: redirectSourceGithubId }),
		adopted_probe: null,
	});

	for (const search of [ redirectSourceGithubId, 'redirect-source' ]) {
		const { items } = await readSponsorsPage<SponsorAccount>(adminPage.request, 'accounts', { search });
		expect(items).toEqual([ expect.objectContaining({ githubId: redirectSourceGithubId, githubLogin: 'redirect-source', status: 'active', periodSponsorshipValue: 30 }) ]);
	}

	for (const search of [ redirectTargetGithubId, redirectSourceGithubId, 'redirect-source' ]) {
		const { items } = await readSponsorsPage<SponsorshipEvent>(adminPage.request, 'events', { search });
		expect(items).toEqual([ expect.objectContaining({ githubId: redirectSourceGithubId, githubLogin: 'redirect-source', sponsorshipValue: 30 }) ]);
	}

	await adminPage.goto('/sponsors');
	const eventsTable = adminPage.getByRole('heading', { name: 'Sponsorship events' }).locator('xpath=ancestor::section[1]');
	await adminPage.getByLabel('Search sponsorship events').fill('redirect-source');


	const redirectIcon = eventsTable.locator('tbody').getByLabel('Credits redirected to redirect-target');
	await expect(redirectIcon).toBeVisible();
	await redirectIcon.hover();
	await expect(adminPage.getByRole('tooltip')).toHaveText('Credits redirected to redirect-target');
	await adminPage.mouse.move(0, 0);
	await expect(adminPage.getByRole('tooltip')).not.toBeVisible();
	await expect(redirectIcon).toHaveAttribute('role', 'img');
	await expect(eventsTable.locator('tbody').getByRole('img', { name: 'Dashboard account linked', exact: true })).toBeVisible();

	await sql('gp_credits_additions').insert({
		github_id: redirectTargetGithubId,
		amount: 5000,
		reason: 'one_time_sponsorship',
		date_created: previousMonthDate(2),
		meta: JSON.stringify({ amountInDollars: 5, githubLogin: 'redirect-target', manual: true }),
	});

	await sql('gp_credits_additions').insert({
		github_id: redirectTargetGithubId,
		amount: 5000,
		reason: 'one_time_sponsorship',
		date_created: previousMonthDate(2),
		meta: JSON.stringify({ amountInDollars: 5, sponsorGithubId: redirectTargetGithubId }),
	});

	for (const githubId of [ redirectSourceGithubId, redirectTargetGithubId ]) {
		const response = await adminPage.request.get(`${process.env.DIRECTUS_URL}/admin-sponsors/accounts?search=${githubId}`);
		expect(response.ok()).toBe(true);
		const { items } = await response.json();
		expect(items).toHaveLength(2);

		expect(items).toEqual(expect.arrayContaining([
			expect.objectContaining({ githubId: redirectSourceGithubId, githubLogin: 'redirect-source', redirectTarget: 'redirect-target', dashboardAccountName: 'redirect-target', periodEvents: 1 }),
			expect.objectContaining({ githubId: redirectTargetGithubId, githubLogin: 'redirect-target', redirectTarget: null, dashboardAccountName: 'redirect-target', periodEvents: 2 }),
		]));
	}
});

test('Manual additions show the redirect and submit the selected bypass option', async ({ adminPage, user, user2 }) => {
	for (const [ actor, githubId, username ] of [ [ user, redirectSourceGithubId, 'redirect-source' ], [ user2, redirectTargetGithubId, 'redirect-target' ] ] as const) {
		await sql('directus_users').where({ id: actor.id }).update({ external_identifier: githubId, github_username: username });
	}

	await adminPage.route('https://api.github.com/users/redirect-source', route => route.fulfill({ json: { id: Number(redirectSourceGithubId), login: 'redirect-source', avatar_url: '', html_url: 'https://github.com/redirect-source' } }));

	await adminPage.route(`${process.env.DIRECTUS_URL}/admin-sponsors/redirect?githubId=${redirectSourceGithubId}`, route => route.fulfill({
		json: { data: { githubId: redirectTargetGithubId, githubLogin: 'redirect-target', dashboardAccount: 'redirect-target' } },
	}));

	await adminPage.route(`${process.env.DIRECTUS_URL}/admin-sponsors/manual-additions`, (route) => {
		if (route.request().method() !== 'POST') { return route.continue(); }

		const { bypassRedirect } = route.request().postDataJSON() as { bypassRedirect: boolean };
		return route.fulfill({
			status: 201,
			json: {
				data: {
					githubId: bypassRedirect ? redirectSourceGithubId : '900000000004',
					githubLogin: bypassRedirect ? 'redirect-source' : 'redirect-updated-target',
				},
			},
		});
	});

	await adminPage.goto('/sponsors');

	for (const bypass of [ false, true ]) {
		await adminPage.getByRole('button', { name: 'Add credits', exact: true }).click();
		const dialog = adminPage.getByRole('dialog', { name: 'Add credits', exact: true });
		await dialog.getByLabel('GitHub username or ID').fill('redirect-source');
		await dialog.getByRole('button', { name: 'Look up' }).click();
		await expect(dialog.getByText('Credits will be redirected to @redirect-target.')).toBeVisible();
		const checkbox = dialog.getByLabel('Bypass redirect for this addition');
		await expect(checkbox).not.toBeChecked();

		if (bypass) { await checkbox.check(); }

		await dialog.getByLabel('Other credits', { exact: true }).check();
		await dialog.getByLabel('Credits to add').fill('5000');
		await dialog.getByLabel('Comment').fill('Redirect test addition.');
		await dialog.getByRole('button', { name: 'Review addition' }).click();
		const destination = bypass ? 'redirect-source' : 'redirect-target';
		await expect(dialog.locator('dd').filter({ hasText: `@${destination} (GitHub ID` })).toBeVisible();
		const created = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/manual-additions') && response.request().method() === 'POST');
		await dialog.getByRole('button', { name: 'Add credits', exact: true }).click();
		const response = await created;
		expect(response.status()).toBe(201);
		expect(response.request().postDataJSON()).toMatchObject({ githubId: redirectSourceGithubId, credits: 5000, type: 'other', bypassRedirect: bypass });
		await expect(dialog).not.toBeVisible();
		await expect(adminPage.getByText(`5,000 credits were added for @${bypass ? 'redirect-source' : 'redirect-updated-target'}.`, { exact: true })).toBeVisible();
	}
});


test('Direct recipient lookup works without a redirect', async ({ adminPage, user }) => {
	const githubId = '900000000003';
	await sql('directus_users').where({ id: user.id }).update({ external_identifier: githubId, github_username: 'fixture-direct' });

	await adminPage.route('https://api.github.com/users/fixture-direct', route => route.fulfill({
		json: { id: Number(githubId), login: 'fixture-direct', avatar_url: '', html_url: 'https://github.com/fixture-direct' },
	}));

	await adminPage.goto('/sponsors');
	await adminPage.getByRole('button', { name: 'Add credits', exact: true }).click();
	const dialog = adminPage.getByRole('dialog', { name: 'Add credits', exact: true });
	await dialog.getByLabel('GitHub username or ID').fill('fixture-direct');
	const lookup = adminPage.waitForResponse(response => response.url().includes(`/admin-sponsors/redirect?githubId=${githubId}`));
	await dialog.getByRole('button', { name: 'Look up' }).click();
	expect(await (await lookup).json()).toEqual({ data: null });
	await expect(dialog.getByText('@fixture-direct', { exact: true })).toBeVisible();
	await expect(dialog.getByLabel('Bypass redirect for this addition')).toHaveCount(0);
	await dialog.getByLabel('Other credits', { exact: true }).check();
	await dialog.getByLabel('Credits to add').fill('5000');
	await dialog.getByLabel('Comment').fill('Direct fixture adjustment.');
	await dialog.getByRole('button', { name: 'Review addition' }).click();
	await expect(dialog.locator('dd').filter({ hasText: '@fixture-direct (GitHub ID' })).toBeVisible();
});

test('Failed redirect lookup requires an explicit bypass before adding credits', async ({ adminPage, user }) => {
	await sql('directus_users').where({ id: user.id }).update({ external_identifier: redirectSourceGithubId, github_username: 'redirect-source' });

	await adminPage.route('https://api.github.com/users/redirect-source', route => route.fulfill({
		json: { id: Number(redirectSourceGithubId), login: 'redirect-source', avatar_url: '', html_url: 'https://github.com/redirect-source' },
	}));

	await adminPage.route(`${process.env.DIRECTUS_URL}/admin-sponsors/redirect?githubId=${redirectSourceGithubId}`, route => route.fulfill({ status: 503, contentType: 'text/html', body: 'Redirect destination lookup is temporarily unavailable.' }));

	await adminPage.route(`${process.env.DIRECTUS_URL}/admin-sponsors/manual-additions`, route => route.request().method() !== 'POST' ? route.continue() : route.fulfill({
		status: 201,
		json: { data: { githubId: redirectSourceGithubId, githubLogin: 'redirect-source' } },
	}));

	await adminPage.goto('/sponsors');
	await adminPage.getByRole('button', { name: 'Add credits', exact: true }).click();
	const dialog = adminPage.getByRole('dialog', { name: 'Add credits', exact: true });
	await dialog.getByLabel('GitHub username or ID').fill('redirect-source');
	await dialog.getByRole('button', { name: 'Look up' }).click();
	await expect(dialog.getByText('@redirect-source', { exact: true })).toBeVisible();
	await expect(dialog.getByText('The redirect destination could not be checked. Retry the lookup or bypass the redirect for this addition.')).toBeVisible();
	await expect(dialog.getByLabel('Bypass redirect for this addition')).not.toBeChecked();
	await dialog.getByLabel('Other credits', { exact: true }).check();
	await dialog.getByLabel('Credits to add').fill('5000');
	await dialog.getByLabel('Comment').fill('Bypass fixture adjustment.');
	await dialog.getByRole('button', { name: 'Review addition' }).click();
	await expect(dialog.getByRole('heading', { name: 'Review addition' })).toHaveCount(0);
	await expect(dialog.getByText('Retry the lookup or explicitly bypass the redirect.')).toBeVisible();
	await dialog.getByLabel('Bypass redirect for this addition').check();
	await dialog.getByRole('button', { name: 'Review addition' }).click();
	await expect(dialog.locator('dd').filter({ hasText: '@redirect-source (GitHub ID' })).toBeVisible();
	await expect(dialog.getByText('Bypassed for this addition', { exact: true })).toBeVisible();
	const created = adminPage.waitForResponse(response => response.url().includes('/admin-sponsors/manual-additions') && response.request().method() === 'POST');
	await dialog.getByRole('button', { name: 'Add credits', exact: true }).click();
	expect((await created).request().postDataJSON()).toMatchObject({ githubId: redirectSourceGithubId, credits: 5000, type: 'other', bypassRedirect: true });
	await expect(dialog).not.toBeVisible();
	await expect(adminPage.getByText('5,000 credits were added for @redirect-source.', { exact: true })).toBeVisible();
});
