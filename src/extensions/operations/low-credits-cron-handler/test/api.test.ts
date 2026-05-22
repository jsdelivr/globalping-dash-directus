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

describe('Low credits cron handler', () => {
	const creditsUpdateByQuery = sinon.stub();
	const creditsUpdateMany = sinon.stub();
	const createMany = sinon.stub();

	const ItemsService = sinon.stub().callsFake((collection: string) => {
		if (collection === 'gp_credits') {
			return { updateByQuery: creditsUpdateByQuery, updateMany: creditsUpdateMany };
		}

		throw new Error(`unexpected collection: ${collection}`);
	});

	const services = {
		ItemsService,
		NotificationsService: sinon.stub().returns({ createMany }),
	} as unknown as OperationContext['services'];

	const accountability = {} as OperationContext['accountability'];
	const logger = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() } as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {} as OperationContext['env'];
	const database = { raw: sinon.stub(), transaction: sinon.stub() } as any;
	const data = {};

	const seed = (rows: CreditRow[]) => {
		database.raw.resetBehavior();
		database.raw.resolves([ rows, [] ]);

		database.transaction.resetBehavior();
		database.transaction.callsFake(async (cb: (trx: unknown) => Promise<unknown>) => cb({}));

		creditsUpdateByQuery.resetBehavior();
		creditsUpdateByQuery.callsFake((query: { filter: { _and: { id?: { _in: number[] } }[] } }) => Promise.resolve(query.filter._and.find(c => c.id)?.id?._in ?? []));

		creditsUpdateMany.resetBehavior();
		creditsUpdateMany.resolves([]);
	};

	beforeEach(() => {
		creditsUpdateByQuery.resetHistory();
		creditsUpdateMany.resetHistory();
		createMany.resetHistory();
		createMany.resetBehavior();
		createMany.resolves([]);
		database.raw.resetHistory();
		database.transaction.resetHistory();
	});

	const ctx = (): OperationContext => ({ data, database, env, getSchema, services, logger, accountability });

	it('creates a low_credits notification and flips the flag to true', async () => {
		seed([
			{ id: 1, user_id: 'user-1', amount: 100, low_credits_notified: false },
		]);

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [ 'user-1' ], reset: [] });
		expect(createMany.callCount).to.equal(1);

		expect(createMany.firstCall.args[0][0]).to.deep.equal({
			recipient: 'user-1',
			type: 'low_credits',
			subject: 'Your Globalping credits are running low',
			message: 'You have 100 credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.',
		});

		expect(creditsUpdateByQuery.callCount).to.equal(1);
		expect(creditsUpdateByQuery.firstCall.args).to.deep.equal([{ filter: { _and: [{ id: { _in: [ 1 ] } }, { low_credits_notified: { _eq: false } }] } }, { low_credits_notified: true }]);
	});

	it('resets the flag when amount recovers above threshold', async () => {
		seed([
			{ id: 7, user_id: 'user-7', amount: 6000, low_credits_notified: true },
		]);

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [ 'user-7' ] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateByQuery.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(1);
		expect(creditsUpdateMany.firstCall.args).to.deep.equal([ [ 7 ], { low_credits_notified: false }]);
	});

	it('does nothing when there are no candidates', async () => {
		seed([]);

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [] });
		expect(createMany.callCount).to.equal(0);
		expect(creditsUpdateByQuery.callCount).to.equal(0);
		expect(creditsUpdateMany.callCount).to.equal(0);
	});
});
