import { expect } from 'chai';
import type { Knex } from 'knex';
import sinon from 'sinon';
import { applyManualSearch, applySearch, fillChartPoints, normalizeManualAddition, normalizeSponsorAccount, normalizeSponsorshipEvent, utcMonthSql } from '../src/queries.js';

describe('sponsor query normalization', () => {
	it('matches numeric GitHub IDs exactly', () => {
		const where = sinon.spy();

		applySearch({ where } as unknown as Knex.QueryBuilder, '123');

		expect(where.calledOnceWithExactly('additions.github_id', '123')).to.equal(true);
	});

	it('matches numeric GitHub IDs exactly in manual additions', () => {
		const where = sinon.spy();

		applyManualSearch({ where } as unknown as Knex.QueryBuilder, '123', 'added-by-expression');

		expect(where.calledOnceWithExactly('additions.github_id', '123')).to.equal(true);
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
			dashboard_user_id: 'user-id',
			dashboard_username: 'dashboard-example',
			reason: 'recurring_sponsorship',
			meta: JSON.stringify({ amountInDollars: 150, monthsCovered: 6, bonus: 25, manual: true }),
		})).to.deep.equal({
			id: 10,
			date: '2026-07-15T10:00:00.000Z',
			githubId: '123',
			githubLogin: 'example',
			dashboardUserId: 'user-id',
			dashboardUsername: 'dashboard-example',
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
			dashboard_user_id: null,
			dashboard_username: null,
			reason: 'tier_changed',
			meta: { amountInDollars: 25, monthsCovered: 3 },
		})).to.deep.equal({
			id: 11,
			date: '2026-07-16T10:00:00.000Z',
			githubId: '456',
			githubLogin: null,
			dashboardUserId: null,
			dashboardUsername: null,
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
			dashboard_user_id: 'recipient-id',
			dashboard_username: 'example',
			added_by: 'Admin User',
			amount: '25000',
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ manual: true, amountInDollars: 15 }),
		})).to.deep.equal({
			id: 20,
			date: '2026-08-14T08:30:00.000Z',
			githubId: '123',
			githubLogin: 'example',
			dashboardUserId: 'recipient-id',
			dashboardUsername: 'example',
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
			dashboard_user_id: null,
			dashboard_username: null,
			added_by: null,
			amount: 5000,
			reason: 'other',
			meta: { manual: true, comment: 'Customer support adjustment.' },
		})).to.deep.equal({
			id: 21,
			date: '2026-08-14T09:30:00.000Z',
			githubId: '456',
			githubLogin: null,
			dashboardUserId: null,
			dashboardUsername: null,
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
			dashboard_user_id: 'user-id',
			dashboard_username: 'dashboard-example',
			is_active: 0,
			has_recurring: '1',
			current_monthly_amount: null,
			period_sponsorship_value: '125.50',
			period_events: '2',
			latest_event: new Date('2026-08-01T12:00:00.000Z'),
		})).to.deep.equal({
			githubId: '123',
			githubLogin: 'example',
			dashboardUserId: 'user-id',
			dashboardUsername: 'dashboard-example',
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
			dashboard_user_id: null,
			dashboard_username: null,
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
			dashboard_user_id: null,
			dashboard_username: null,
			is_active: 0,
			has_recurring: 0,
			current_monthly_amount: null,
			period_sponsorship_value: 5,
			period_events: 1,
			latest_event: '2026-08-03T12:00:00.000Z',
		}).status).to.equal('one-time');
	});
});
