import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { checkLowCredits } from '../src/actions/check-low-credits.js';

type CreditRow = {
	id: number;
	user_id: string;
	amount: number;
	low_credits_notified: boolean;
};

type UserPrefRow = {
	id: string;
	notification_preferences: Record<string, { enabled?: boolean; emailEnabled?: boolean; parameter?: number }> | null;
};

describe('Low credits cron handler', () => {
	const usersReadByQuery = sinon.stub();
	const creditsReadByQuery = sinon.stub();
	const creditsUpdateMany = sinon.stub();
	const createMany = sinon.stub();

	const ItemsService = sinon.stub().callsFake((collection: string) => {
		if (collection === 'directus_users') {
			return { readByQuery: usersReadByQuery };
		}

		if (collection === 'gp_credits') {
			return { readByQuery: creditsReadByQuery, updateMany: creditsUpdateMany };
		}

		throw new Error(`unexpected collection: ${collection}`);
	});

	const services = {
		ItemsService,
		NotificationsService: sinon.stub().returns({ createMany }),
	} as unknown as OperationContext['services'];

	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {} as OperationContext['env'];
	const database = sinon.stub() as any;
	const data = {};

	const seed = (opts: {
		notifyRows: CreditRow[];
		resetRows: CreditRow[];
		userPrefs: UserPrefRow[];
		customRows?: CreditRow[];
	}) => {
		// findCandidates calls creditsService.readByQuery three times in this
		// synchronous order inside Promise.all: notify, reset, custom (only if
		// there are custom thresholds; otherwise that arm is Promise.resolve([])).
		usersReadByQuery.resetBehavior();
		usersReadByQuery.resolves(opts.userPrefs);

		creditsReadByQuery.resetBehavior();
		creditsReadByQuery.onCall(0).resolves(opts.notifyRows);
		creditsReadByQuery.onCall(1).resolves(opts.resetRows);

		if (opts.customRows !== undefined) {
			creditsReadByQuery.onCall(2).resolves(opts.customRows);
		}

		creditsUpdateMany.resetBehavior();
		creditsUpdateMany.resolves([]);
	};

	beforeEach(() => {
		usersReadByQuery.resetHistory();
		creditsReadByQuery.resetHistory();
		creditsUpdateMany.resetHistory();
		createMany.resetHistory();
		createMany.resetBehavior();
		createMany.resolves([]);
	});

	const ctx = (): OperationContext => ({ data, database, env, getSchema, services, logger, accountability });

	it('creates a low_credits notification and flips the flag to true', async () => {
		seed({
			notifyRows: [
				{ id: 1, user_id: 'user-1', amount: 100, low_credits_notified: false },
			],
			resetRows: [],
			userPrefs: [],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [ 'user-1' ], reset: [] });
		expect(createMany.callCount).to.equal(1);

		expect(createMany.firstCall.args[0][0]).to.deep.equal({
			recipient: 'user-1',
			type: 'low_credits',
			subject: 'Your Globalping credits are running low',
			message: 'You have 100 credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.',
		});

		expect(creditsUpdateMany.callCount).to.equal(1);
		expect(creditsUpdateMany.firstCall.args).to.deep.equal([ [ 1 ], { low_credits_notified: true }]);
	});

	it('resets the flag when amount recovers above default threshold', async () => {
		seed({
			notifyRows: [],
			resetRows: [
				{ id: 7, user_id: 'user-7', amount: 6000, low_credits_notified: true },
			],
			userPrefs: [],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [ 'user-7' ] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(1);
		expect(creditsUpdateMany.firstCall.args).to.deep.equal([ [ 7 ], { low_credits_notified: false }]);
	});

	it('excludes disabled users from the bulk SQL prefilter and skips them in code', async () => {
		// Bulk queries return [] because the action's filter passes user-2 in _nin.
		seed({
			notifyRows: [],
			resetRows: [],
			userPrefs: [
				{ id: 'user-2', notification_preferences: { low_credits: { enabled: false } } },
			],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(0);
	});

	it('uses the custom higher threshold: notifies a user at amount=8000 if their parameter is 10000', async () => {
		seed({
			notifyRows: [],
			resetRows: [],
			userPrefs: [
				{ id: 'user-3', notification_preferences: { low_credits: { enabled: true, parameter: 10000 } } },
			],
			customRows: [
				{ id: 9, user_id: 'user-3', amount: 8000, low_credits_notified: false },
			],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [ 'user-3' ], reset: [] });
		expect(createMany.callCount).to.equal(1);

		expect(createMany.firstCall.args[0][0]).to.deep.equal({
			recipient: 'user-3',
			type: 'low_credits',
			subject: 'Your Globalping credits are running low',
			message: 'You have 8000 credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.',
		});

		expect(creditsUpdateMany.callCount).to.equal(1);
		expect(creditsUpdateMany.firstCall.args).to.deep.equal([ [ 9 ], { low_credits_notified: true }]);
	});

	it('uses the custom lower threshold: amount=3000 with parameter=1000 is NOT notified', async () => {
		seed({
			notifyRows: [],
			resetRows: [],
			userPrefs: [
				{ id: 'user-4', notification_preferences: { low_credits: { enabled: true, parameter: 1000 } } },
			],
			customRows: [
				{ id: 4, user_id: 'user-4', amount: 3000, low_credits_notified: false },
			],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(0);
	});

	it('resets a custom-threshold user when amount recovers above their parameter', async () => {
		seed({
			notifyRows: [],
			resetRows: [],
			userPrefs: [
				{ id: 'user-5', notification_preferences: { low_credits: { enabled: true, parameter: 10000 } } },
			],
			customRows: [
				{ id: 5, user_id: 'user-5', amount: 15000, low_credits_notified: true },
			],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [ 'user-5' ] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(1);
		expect(creditsUpdateMany.firstCall.args).to.deep.equal([ [ 5 ], { low_credits_notified: false }]);
	});

	it('notifies at the boundary: amount == default threshold (5000)', async () => {
		seed({
			notifyRows: [
				{ id: 11, user_id: 'user-11', amount: 5000, low_credits_notified: false },
			],
			resetRows: [],
			userPrefs: [],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [ 'user-11' ], reset: [] });
		expect(createMany.callCount).to.equal(1);
	});

	it('notifies at the boundary: amount == custom threshold', async () => {
		seed({
			notifyRows: [],
			resetRows: [],
			userPrefs: [
				{ id: 'user-12', notification_preferences: { low_credits: { enabled: true, parameter: 2000 } } },
			],
			customRows: [
				{ id: 12, user_id: 'user-12', amount: 2000, low_credits_notified: false },
			],
		});

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [ 'user-12' ], reset: [] });
		expect(createMany.callCount).to.equal(1);
	});

	it('does nothing when there are no candidates', async () => {
		seed({ notifyRows: [], resetRows: [], userPrefs: [] });

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(0);
	});
});
