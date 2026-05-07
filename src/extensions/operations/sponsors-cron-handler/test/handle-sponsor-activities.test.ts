import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import { SponsorActivitiesHandler } from '../src/actions/handle-sponsor-activities.js';

describe('SponsorActivitiesHandler', () => {
	// Frozen at 2026-05-06T12:00:00Z
	// windowStart = 2026-05-05T12:00:00Z (−24 h)
	// windowEnd  = 2026-05-06T11:50:00Z (−10 min)
	const NOW = new Date('2026-05-06T12:00:00.000Z');

	const database = {
		transaction: async (f: any) => f({}),
	} as unknown as OperationContext['database'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const env = {
		GITHUB_ACCESS_TOKEN: 'test-token',
		CREDITS_PER_DOLLAR: '10000',
		CREDITS_BONUS_PER_100_DOLLARS: '5',
		MAX_CREDITS_BONUS: '1500',
	};

	const creditsAdditionsService = {
		createOne: sinon.stub().resolves(42),
		readByQuery: sinon.stub().resolves([]),
	};
	const sponsorsService = {
		createOne: sinon.stub().resolves(7),
		readByQuery: sinon.stub().resolves([]),
	};
	const usersService = {
		updateByQuery: sinon.stub(),
	};
	const services = {
		ItemsService: sinon.stub().callsFake((collection: string) => {
			if (collection === 'gp_credits_additions') { return creditsAdditionsService; }

			if (collection === 'sponsors') { return sponsorsService; }

			throw new Error(`Unexpected collection: ${collection}`);
		}),
		UsersService: sinon.stub().returns(usersService),
	} as unknown as OperationContext['services'];

	const context = { data: {}, database, env, getSchema, services, logger, accountability };

	let clock: sinon.SinonFakeTimers;

	before(() => {
		nock.disableNetConnect();
		clock = sinon.useFakeTimers({ now: NOW, toFake: [ 'Date' ] });
	});

	after(() => {
		nock.cleanAll();
		clock.restore();
	});

	beforeEach(() => {
		sinon.resetHistory();
		creditsAdditionsService.readByQuery.resolves([]);
		sponsorsService.readByQuery.resolves([]);
	});

	function mockActivities (nodes: object[]) {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorsActivities: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes,
					},
				},
			},
		});
	}

	const activityTimestamp = '2026-05-05T15:00:00.000Z';

	// ── NEW_SPONSORSHIP one-time ──────────────────────────────────────────────

	it('creates one-time credit when no existing credit found', async () => {
		mockActivities([{
			id: 'SA_1',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 10, login: 'alice' },
			sponsorsTier: { id: 'tier_ot_1', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([]); // getRecentCreditsAdditions
		creditsAdditionsService.readByQuery.onSecondCall().resolves([]); // getUserBonus

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);

		expect(creditsAdditionsService.createOne.args[0]).to.deep.equal([{
			github_id: '10',
			amount: 50000,
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: 5, bonus: 0, tierId: 'tier_ot_1' },
		}]);

		expect(results).to.have.length(1);
		expect(results[0]).to.include('SA_1');
	});

	it('skips one-time credit when phase-1 tierId matches', async () => {
		mockActivities([{
			id: 'SA_2',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 10, login: 'alice' },
			sponsorsTier: { id: 'tier_ot_1', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([{
			github_id: '10',
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: 5, tierId: 'tier_ot_1' },
			date_created: '2026-05-05T15:00:05.000Z',
		}]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	it('skips one-time credit when phase-2 date matches within 60s', async () => {
		mockActivities([{
			id: 'SA_3',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 10, login: 'alice' },
			sponsorsTier: { id: 'tier_ot_1', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		// different tierId → phase-1 fails; date is 30s after activity → phase-2 matches
		creditsAdditionsService.readByQuery.onFirstCall().resolves([{
			github_id: '10',
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: 5, tierId: 'different_tier' },
			date_created: '2026-05-05T15:00:30.000Z',
		}]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	it('creates one-time credit when date is outside 60s window', async () => {
		mockActivities([{
			id: 'SA_4',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 10, login: 'alice' },
			sponsorsTier: { id: 'tier_ot_1', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		// different tierId → phase-1 fails; date is 5 min later → phase-2 fails
		creditsAdditionsService.readByQuery.onFirstCall().resolves([{
			github_id: '10',
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: 5, tierId: 'different_tier' },
			date_created: '2026-05-05T15:05:00.000Z',
		}]);

		creditsAdditionsService.readByQuery.onSecondCall().resolves([]);

		const handler = new SponsorActivitiesHandler();
		await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);
	});

	// ── NEW_SPONSORSHIP recurring ─────────────────────────────────────────────

	it('creates recurring sponsor + credit when sponsor does not exist', async () => {
		mockActivities([{
			id: 'SA_5',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 20, login: 'bob' },
			sponsorsTier: { id: 'tier_rec_1', monthlyPriceInDollars: 10, isOneTime: false },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([]); // getRecentCreditsAdditions
		sponsorsService.readByQuery.resolves([]); // sponsorExists → not found
		creditsAdditionsService.readByQuery.onSecondCall().resolves([]); // getUserBonus

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(sponsorsService.createOne.callCount).to.equal(1);

		expect(sponsorsService.createOne.args[0]).to.deep.equal([{
			github_login: 'bob',
			github_id: '20',
			monthly_amount: 10,
			last_earning_date: activityTimestamp,
		}]);

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);

		expect(creditsAdditionsService.createOne.args[0]).to.deep.equal([{
			github_id: '20',
			amount: 100000,
			reason: 'recurring_sponsorship',
			meta: { amountInDollars: 10, monthsCovered: 1, bonus: 0, tierId: 'tier_rec_1' },
		}]);

		expect(results).to.have.length(1);
	});

	it('skips recurring credit when sponsor already exists', async () => {
		mockActivities([{
			id: 'SA_6',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 20, login: 'bob' },
			sponsorsTier: { id: 'tier_rec_1', monthlyPriceInDollars: 10, isOneTime: false },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([]); // getRecentCreditsAdditions
		sponsorsService.readByQuery.resolves([{ id: 1 }]); // sponsorExists → found

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(sponsorsService.createOne.callCount).to.equal(0);
		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	// ── TIER_CHANGE ───────────────────────────────────────────────────────────

	it('creates tier_changed credit for upgrade with no match', async () => {
		mockActivities([{
			id: 'SA_7',
			action: 'TIER_CHANGE',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 30, login: 'carol' },
			sponsorsTier: { id: 'tier_2', monthlyPriceInDollars: 15, isOneTime: false },
			previousSponsorsTier: { monthlyPriceInDollars: 10 },
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([]);
		creditsAdditionsService.readByQuery.onSecondCall().resolves([]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(1);

		expect(creditsAdditionsService.createOne.args[0]).to.deep.equal([{
			github_id: '30',
			amount: 50000, // diff = 5, 5 * 10000 = 50000
			reason: 'tier_changed',
			meta: { amountInDollars: 5, bonus: 0, tierId: 'tier_2' },
		}]);

		expect(results).to.have.length(1);
	});

	it('skips tier_changed credit for downgrade', async () => {
		mockActivities([{
			id: 'SA_8',
			action: 'TIER_CHANGE',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 30, login: 'carol' },
			sponsorsTier: { id: 'tier_1', monthlyPriceInDollars: 5, isOneTime: false },
			previousSponsorsTier: { monthlyPriceInDollars: 10 },
		}]);

		creditsAdditionsService.readByQuery.resolves([]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	it('skips tier_changed credit when phase-1 tierId matches', async () => {
		mockActivities([{
			id: 'SA_9',
			action: 'TIER_CHANGE',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 30, login: 'carol' },
			sponsorsTier: { id: 'tier_2', monthlyPriceInDollars: 15, isOneTime: false },
			previousSponsorsTier: { monthlyPriceInDollars: 10 },
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([{
			github_id: '30',
			reason: 'tier_changed',
			meta: { amountInDollars: 5, tierId: 'tier_2' },
			date_created: '2026-05-05T15:00:04.000Z',
		}]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	// ── ID redirect ───────────────────────────────────────────────────────────

	it('skips one-time credit when existing credit found under redirect', async () => {
		// 66716858 → '6209808'; existing credit stored under redirected ID should match
		mockActivities([{
			id: 'SA_11',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 66716858, login: 'redirected-user' },
			sponsorsTier: { id: 'tier_ot_x', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([{
			github_id: '6209808',
			reason: 'one_time_sponsorship',
			meta: { amountInDollars: 5, tierId: 'tier_ot_x' },
			date_created: '2026-05-05T15:00:05.000Z',
		}]);

		const handler = new SponsorActivitiesHandler();
		const results = await handler.handle(context);

		expect(creditsAdditionsService.createOne.callCount).to.equal(0);
		expect(results).to.deep.equal([]);
	});

	it('redirects github_id via SOURCE_ID_TO_TARGET_ID before creating credit', async () => {
		// 66716858 → '6209808' per SOURCE_ID_TO_TARGET_ID in add-credits.ts
		mockActivities([{
			id: 'SA_10',
			action: 'NEW_SPONSORSHIP',
			timestamp: activityTimestamp,
			sponsor: { databaseId: 66716858, login: 'redirected-user' },
			sponsorsTier: { id: 'tier_ot_x', monthlyPriceInDollars: 5, isOneTime: true },
			previousSponsorsTier: null,
		}]);

		creditsAdditionsService.readByQuery.onFirstCall().resolves([]);
		creditsAdditionsService.readByQuery.onSecondCall().resolves([]);

		const handler = new SponsorActivitiesHandler();
		await handler.handle(context);

		expect(creditsAdditionsService.createOne.firstCall.args[0].github_id).to.equal('6209808');
	});

	// ── window tracking ───────────────────────────────────────────────────────

	it('updates lastWindowEnd to windowEnd after each run', async () => {
		mockActivities([]);
		creditsAdditionsService.readByQuery.resolves([]);

		const handler = new SponsorActivitiesHandler();
		expect(handler.lastWindowEnd).to.equal(null);

		await handler.handle(context);

		// windowEnd = NOW - 10 min = 2026-05-06T11:50:00.000Z
		expect(handler.lastWindowEnd).to.equal(new Date('2026-05-06T11:50:00.000Z').getTime());
	});
});
