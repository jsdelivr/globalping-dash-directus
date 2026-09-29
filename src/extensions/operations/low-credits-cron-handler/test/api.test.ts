import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { checkLowCredits } from '../src/actions/check-low-credits.js';

// A row per account recipient, as returned by the candidates query.
type CandidateRow = {
	id: number;
	account_id: string;
	amount: number;
	allNotifiedUsers: string;
	recipient: string;
	threshold: number;
	enabled: number;
};

describe('Low credits cron handler', () => {
	const creditsUpdateOne = sinon.stub();
	const createOne = sinon.stub();

	const ItemsService = sinon.stub().callsFake((collection: string) => {
		if (collection === 'gp_credits') {
			return { updateOne: creditsUpdateOne };
		}

		throw new Error(`unexpected collection: ${collection}`);
	});

	const services = {
		ItemsService,
		NotificationsService: sinon.stub().returns({ createOne }),
	} as unknown as OperationContext['services'];

	const accountability = {} as OperationContext['accountability'];
	const logger = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() } as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {} as OperationContext['env'];
	const database = { raw: sinon.stub(), transaction: sinon.stub() } as any;
	const data = {};

	const candidate = (row: Partial<CandidateRow>): CandidateRow => ({
		id: 1,
		account_id: 'account-1',
		amount: 100,
		allNotifiedUsers: '[]',
		recipient: 'user-1',
		threshold: 5000,
		enabled: 1,
		...row,
	});

	const seed = (rows: CandidateRow[]) => {
		database.raw.resetBehavior();
		database.raw.resolves([ rows, [] ]);

		database.transaction.resetBehavior();
		database.transaction.callsFake(async (cb: (trx: unknown) => Promise<unknown>) => cb({}));

		creditsUpdateOne.resetBehavior();
		creditsUpdateOne.resolves([]);
	};

	beforeEach(() => {
		creditsUpdateOne.resetHistory();
		createOne.resetHistory();
		createOne.resetBehavior();
		createOne.resolves('notification-id');
		database.raw.resetHistory();
		database.transaction.resetHistory();
	});

	const ctx = (): OperationContext => ({ data, database, env, getSchema, services, logger, accountability });

	it('notifies the account owner and remembers them', async () => {
		seed([ candidate({}) ]);

		const result = await checkLowCredits(ctx());

		expect(result.notified).to.deep.equal([ 'user-1' ]);
		expect(createOne.callCount).to.equal(1);
		expect(createOne.args[0]?.[0]).to.include({ account: 'account-1', recipient: 'user-1', type: 'low_credits' });
		expect(creditsUpdateOne.args[0]).to.deep.equal([ 1, { low_credits_notified: [ 'user-1' ] }]);
	});

	it('notifies everybody it can and reports the failures together', async () => {
		seed([
			candidate({ recipient: 'admin-1' }),
			candidate({ recipient: 'admin-2' }),
		]);

		createOne.onFirstCall().rejects(new Error('nope'));

		const error = await checkLowCredits(ctx()).catch((error: Error) => error) as Error;
		expect(error.message).to.equal('Failed to notify 1 of 2 recipients.');

		expect(createOne.callCount).to.equal(2);
		expect(createOne.args[1]?.[0]).to.include({ recipient: 'admin-2' });
	});

	it('does not notify a recipient twice within the same episode', async () => {
		seed([ candidate({ allNotifiedUsers: '["user-1"]' }) ]);

		const result = await checkLowCredits(ctx());

		expect(result.notified).to.deep.equal([]);
		expect(createOne.callCount).to.equal(0);
		expect(creditsUpdateOne.callCount).to.equal(0);
	});

	it('notifies each org admin at their own threshold', async () => {
		seed([
			candidate({ recipient: 'admin-1', amount: 4000, threshold: 5000 }),
			candidate({ recipient: 'admin-2', amount: 4000, threshold: 1000 }),
		]);

		const result = await checkLowCredits(ctx());

		expect(result.notified).to.deep.equal([ 'admin-1' ]);
		expect(creditsUpdateOne.args[0]).to.deep.equal([ 1, { low_credits_notified: [ 'admin-1' ] }]);
	});

	it('forgets a recipient once the balance is above their own threshold again', async () => {
		seed([
			candidate({ recipient: 'admin-1', amount: 4000, threshold: 5000, allNotifiedUsers: '["admin-1","admin-2"]' }),
			candidate({ recipient: 'admin-2', amount: 4000, threshold: 1000, allNotifiedUsers: '["admin-1","admin-2"]' }),
		]);

		const result = await checkLowCredits(ctx());

		// admin-2 is above their threshold again, admin-1 stays notified.
		expect(createOne.callCount).to.equal(0);
		expect(creditsUpdateOne.args[0]).to.deep.equal([ 1, { low_credits_notified: [ 'admin-1' ] }]);
		expect(result.reset).to.deep.equal([]);
	});

	it('skips a recipient who disabled the notification', async () => {
		seed([ candidate({ enabled: 0 }) ]);

		const result = await checkLowCredits(ctx());

		expect(result.notified).to.deep.equal([]);
		expect(createOne.callCount).to.equal(0);
	});

	it('does nothing when there are no candidates', async () => {
		seed([]);

		const result = await checkLowCredits(ctx());

		expect(result).to.deep.equal({ notified: [], reset: [] });
		expect(createOne.callCount).to.equal(0);
		expect(creditsUpdateOne.callCount).to.equal(0);
	});
});
