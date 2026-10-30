import { expect } from 'chai';
import knex, { type Knex } from 'knex';
import sinon from 'sinon';
import { applyManualSearch, applySearch, fillChartPoints, getSponsorAccounts, getSponsorshipEvents, normalizeManualAddition, normalizeSponsorAccount, normalizeSponsorshipEvent, utcMonthSql } from '../src/queries.js';

describe('sponsor query normalization', () => {
	it('matches the sponsor GitHub ID exactly while searching event usernames', () => {
		const builder = {
			where: sinon.stub().returnsThis(),
			whereRaw: sinon.stub().returnsThis(),
			orWhere: sinon.stub().returnsThis(),
			orWhereRaw: sinon.stub().returnsThis(),
		};

		const where = sinon.spy((callback: (builder: Knex.QueryBuilder) => void) => callback(builder as unknown as Knex.QueryBuilder));

		applySearch({ where } as unknown as Knex.QueryBuilder, '66716858');

		expect(builder.whereRaw.calledOnceWithExactly(`COALESCE(JSON_VALUE(additions.meta, '$.sponsorGithubId'), additions.github_id) = ?`, [ '66716858' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly('sponsors.github_login LIKE ?', [ '%66716858%' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly('COALESCE(directus_users.github_username, gp_orgs.name) LIKE ?', [ '%66716858%' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly(`NULLIF(JSON_UNQUOTE(JSON_EXTRACT(additions.meta, '$.githubLogin')), '') LIKE ?`, [ '%66716858%' ])).to.equal(true);
	});

	it('matches the sponsor GitHub ID exactly while searching manual-addition usernames', () => {
		const builder = {
			where: sinon.stub().returnsThis(),
			whereRaw: sinon.stub().returnsThis(),
			orWhere: sinon.stub().returnsThis(),
			orWhereRaw: sinon.stub().returnsThis(),
		};

		const where = sinon.spy((callback: (builder: Knex.QueryBuilder) => void) => callback(builder as unknown as Knex.QueryBuilder));

		applyManualSearch({ where } as unknown as Knex.QueryBuilder, '66716858', 'added-by-expression');

		expect(builder.whereRaw.calledOnceWithExactly(`COALESCE(JSON_VALUE(additions.meta, '$.sponsorGithubId'), additions.github_id) = ?`, [ '66716858' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly('sponsors.github_login LIKE ?', [ '%66716858%' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly('COALESCE(directus_users.github_username, gp_orgs.name) LIKE ?', [ '%66716858%' ])).to.equal(true);
		expect(builder.orWhereRaw.calledWithExactly(`NULLIF(JSON_UNQUOTE(JSON_EXTRACT(additions.meta, '$.githubLogin')), '') LIKE ?`, [ '%66716858%' ])).to.equal(true);
	});

	it('groups monthly chart timestamps in UTC', () => {
		expect(utcMonthSql('additions.date_created')).to.equal(`DATE_FORMAT(CONVERT_TZ(additions.date_created, @@session.time_zone, '+00:00'), '%Y-%m')`);
	});

	it('multiplies recurring sponsorship value by covered months', () => {
		expect(normalizeSponsorshipEvent({
			id: 10,
			date_created: '2026-07-15T10:00:00.000Z',
			github_id: '123',
			github_login: 'example',
			dashboard_account_id: 'user-id',
			dashboard_account_name: 'dashboard-example',
			dashboard_account_is_org: 0,
			reason: 'recurring_sponsorship',
			meta: JSON.stringify({ amountInDollars: 150, monthsCovered: 6, bonus: 25, manual: true }),
		})).to.deep.equal({
			id: 10,
			date: '2026-07-15T10:00:00.000Z',
			githubId: '123',
			githubLogin: 'example',
			dashboardAccountId: 'user-id',
			dashboardAccountName: 'dashboard-example',
			dashboardAccountIsOrg: false,
			reason: 'recurring_sponsorship',
			manual: true,
			amountInDollars: 150,
			monthsCovered: 6,
			sponsorshipValue: 900,
		});
	});

	it('does not multiply tier-increase value and normalizes missing optional data', () => {
		expect(normalizeSponsorshipEvent({
			id: 11,
			date_created: new Date('2026-07-16T10:00:00.000Z'),
			github_id: '456',
			github_login: null,
			dashboard_account_id: null,
			dashboard_account_name: null,
			dashboard_account_is_org: 0,
			reason: 'tier_changed',
			meta: { amountInDollars: 25, monthsCovered: 3 },
		})).to.deep.equal({
			id: 11,
			date: '2026-07-16T10:00:00.000Z',
			githubId: '456',
			githubLogin: null,
			dashboardAccountId: null,
			dashboardAccountName: null,
			dashboardAccountIsOrg: false,
			reason: 'tier_changed',
			manual: false,
			amountInDollars: 25,
			monthsCovered: 1,
			sponsorshipValue: 25,
		});
	});

	it('fills missing chart months and normalizes aggregate strings', () => {
		expect(fillChartPoints([ '2026-06', '2026-07', '2026-08' ], [{
			month: '2026-07',
			recurring_value: '120.50',
			one_time_value: '50.00',
			events: '4',
		}])).to.deep.equal([
			{ month: '2026-06', recurringValue: 0, oneTimeValue: 0, events: 0 },
			{ month: '2026-07', recurringValue: 120.5, oneTimeValue: 50, events: 4 },
			{ month: '2026-08', recurringValue: 0, oneTimeValue: 0, events: 0 },
		]);
	});

	it('normalizes both kinds of manual additions and their audit details', () => {
		expect(normalizeManualAddition({
			id: 20,
			date_created: '2026-08-14T08:30:00.000Z',
			github_id: '123',
			github_login: 'example',
			dashboard_account_id: 'recipient-id',
			dashboard_account_name: 'example',
			dashboard_account_is_org: 1,
			added_by: 'Admin User',
			amount: '25000',
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ manual: true, amountInDollars: 15 }),
		})).to.deep.equal({
			id: 20,
			date: '2026-08-14T08:30:00.000Z',
			githubId: '123',
			githubLogin: 'example',
			dashboardAccountId: 'recipient-id',
			dashboardAccountName: 'example',
			dashboardAccountIsOrg: true,
			addedBy: 'Admin User',
			type: 'payment',
			credits: 25_000,
			amountInDollars: 15,
			comment: null,
		});

		expect(normalizeManualAddition({
			id: 21,
			date_created: new Date('2026-08-14T09:30:00.000Z'),
			github_id: '456',
			github_login: null,
			dashboard_account_id: null,
			dashboard_account_name: null,
			dashboard_account_is_org: 0,
			added_by: null,
			amount: 5000,
			reason: 'other',
			meta: { manual: true, comment: 'Customer support adjustment.' },
		})).to.deep.equal({
			id: 21,
			date: '2026-08-14T09:30:00.000Z',
			githubId: '456',
			githubLogin: null,
			dashboardAccountId: null,
			dashboardAccountName: null,
			dashboardAccountIsOrg: false,
			addedBy: null,
			type: 'other',
			credits: 5000,
			amountInDollars: null,
			comment: 'Customer support adjustment.',
		});
	});

	it('normalizes account aggregates and classifies recurring history', () => {
		expect(normalizeSponsorAccount({
			github_id: '123',
			github_login: 'example',
			dashboard_account_id: 'user-id',
			dashboard_account_name: 'dashboard-example',
			dashboard_account_is_org: 0,
			is_active: 0,
			has_recurring: '1',
			current_monthly_amount: null,
			period_sponsorship_value: '125.50',
			period_events: '2',
			latest_event: new Date('2026-08-01T12:00:00.000Z'),
		})).to.deep.equal({
			githubId: '123',
			githubLogin: 'example',
			dashboardAccountId: 'user-id',
			dashboardAccountName: 'dashboard-example',
			dashboardAccountIsOrg: false,
			status: 'former',
			currentMonthlyAmount: null,
			periodSponsorshipValue: 125.5,
			periodEvents: 2,
			latestEvent: '2026-08-01T12:00:00.000Z',
		});
	});

	it('prefers active status and otherwise identifies one-time sponsors', () => {
		expect(normalizeSponsorAccount({
			github_id: '456',
			github_login: null,
			dashboard_account_id: null,
			dashboard_account_name: null,
			dashboard_account_is_org: 0,
			is_active: 1,
			has_recurring: 0,
			current_monthly_amount: '15.00',
			period_sponsorship_value: 15,
			period_events: 1,
			latest_event: '2026-08-02T12:00:00.000Z',
		}).status).to.equal('active');

		expect(normalizeSponsorAccount({
			github_id: '789',
			github_login: null,
			dashboard_account_id: null,
			dashboard_account_name: null,
			dashboard_account_is_org: 0,
			is_active: 0,
			has_recurring: 0,
			current_monthly_amount: null,
			period_sponsorship_value: 5,
			period_events: 1,
			latest_event: '2026-08-03T12:00:00.000Z',
		}).status).to.equal('one-time');
	});

	describe('redirected sponsorship', () => {
		const sponsorIdSql = `COALESCE(JSON_VALUE(additions.meta, '$.sponsorGithubId'), additions.github_id)`;
		const range = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2027-01-01T00:00:00.000Z'), monthKeys: [] };
		const database = knex({ client: 'mysql' });
		let sql: string[];

		beforeEach(() => {
			sql = [];
			sinon.stub(database.client, 'acquireConnection').resolves({});
			sinon.stub(database.client, 'releaseConnection').resolves();

			sinon.stub(database.client, '_query').callsFake(async (...args: unknown[]) => {
				const query = args[1] as { sql: string };
				sql.push(query.sql);
				return { ...query, response: [ [] ] };
			});
		});

		afterEach(() => {
			sinon.restore();
		});

		after(() => database.destroy());

		it('shows events under the sponsor and the account of the receiver', async () => {
			await getSponsorshipEvents(database, range, { period: '2026', offset: 0, limit: 10, search: '66716858', sort: 'date', direction: 'desc' });

			const rowsSql = sql.find(query => query.includes(' AS github_id'))!;
			expect(rowsSql).to.include(`${sponsorIdSql} AS github_id`);
			expect(rowsSql).to.include(`LEFT JOIN sponsors ON sponsors.github_id = ${sponsorIdSql}`);
			expect(rowsSql).to.include(`COALESCE(sponsors.github_login, CASE WHEN ${sponsorIdSql} = additions.github_id THEN COALESCE(directus_users.github_username, gp_orgs.name) END, `);
			expect(rowsSql).to.include('`directus_users`.`external_identifier` = `additions`.`github_id`');
			expect(rowsSql).to.include(`${sponsorIdSql} = ?`);
		});

		it('groups accounts by the sponsor and links them by the receiver', async () => {
			await getSponsorAccounts(database, range, { period: '2026', offset: 0, limit: 10, search: '66716858', statuses: [ 'active' ], linked: true, sort: 'currentMonthly', direction: 'desc' });

			const rowsSql = sql.find(query => query.includes('is_active'))!;
			expect(rowsSql).to.include(`${sponsorIdSql} AS github_id`);
			expect(rowsSql).to.include(`group by ${sponsorIdSql}`);
			expect(rowsSql).to.include('LEFT JOIN sponsors ON sponsors.github_id = additions.github_id');
			expect(rowsSql).to.include('IF(sponsors.github_id IS NOT NULL, 1, 0) AS is_active');
			expect(rowsSql).to.include('sponsors.monthly_amount AS current_monthly_amount');
			expect(rowsSql).to.include('CASE WHEN additions.github_id = additions.receiver_github_id THEN COALESCE(directus_users.github_username, gp_orgs.name) END');
			expect(rowsSql).to.include('additions.github_id = ?');
			expect(rowsSql).to.include('`directus_users`.`external_identifier` = `additions`.`receiver_github_id`');
			expect(rowsSql).to.include('COALESCE(directus_users.id, gp_orgs.id) IS NOT NULL');
		});
	});
});
