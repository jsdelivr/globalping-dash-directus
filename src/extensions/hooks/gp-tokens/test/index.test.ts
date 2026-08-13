import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any, meta?: any, eventContext?: any) => void | Promise<void>;
type ActionCallback = (meta: any, context: any) => void;

describe('token hooks', () => {
	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
		action: {} as Record<string, ActionCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => {
			callbacks.filter[name] = cb;
		},
		action: (name: string, cb: ActionCallback) => {
			callbacks.action[name] = cb;
		},
	} as any;

	hook(events, {} as HookExtensionContext);

	beforeEach(() => {
		sinon.resetHistory();
	});

	it('should remove trailing slash', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'https://www.jsdelivr.com/' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'https://www.jsdelivr.com' ]);
	});

	it('should add missing protocol', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});

	it('should not add protocol if it exists', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'alo://jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'alo://jsdelivr.com' ]);
	});

	it('should reject invalid origin', async () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ '@#$@^%' ],
		};

		const error = await Promise.resolve(callbacks.filter['gp_tokens.items.create']?.(payload)).catch(err => err);

		expect((error as Error).message).to.equal('Invalid URL: https://@#$@^%');
	});

	it('should call validation for update too', () => {
		const payload = {
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.update']?.(payload, {}, { accountability: { user: 'user-id', admin: false } });

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});

	describe('account validation on create', () => {
		const first = sinon.stub();
		const queryBuilder = {
			leftJoin: sinon.stub(),
			where: sinon.stub(),
			first,
		};
		queryBuilder.leftJoin.returns(queryBuilder);
		queryBuilder.where.returns(queryBuilder);
		const database = sinon.stub().returns(queryBuilder);
		const accountability = { user: 'user-id', admin: false };

		const create = (payload: any, eventContext: any = { accountability, database }) => {
			return callbacks.filter['gp_tokens.items.create']?.(payload, {}, eventContext);
		};

		beforeEach(() => {
			first.resolves({ id: 'account-id' });
		});

		it('should pass when the account is available to the user', async () => {
			await create({ name: 'name', value: 'value', account_id: 'account-id' });

			expect(database.callCount).to.equal(1);
			expect(first.callCount).to.equal(1);
		});

		it('should reject when the account is not available to the user', async () => {
			first.resolves(undefined);

			const error = await Promise.resolve(create({ name: 'name', value: 'value', account_id: 'foreign-account-id' })).catch(err => err);

			expect((error as Error).message).to.equal('You can not create a token for this account.');
		});

		it('should skip the check when account_id is not in the payload', async () => {
			await create({ name: 'name', value: 'value' });

			expect(database.callCount).to.equal(0);
		});

		it('should skip the check when account_id is null', async () => {
			await create({ name: 'name', value: 'value', account_id: null });

			expect(database.callCount).to.equal(0);
		});

		it('should skip the check for an admin', async () => {
			await create({ name: 'name', value: 'value', account_id: 'any-account-id' }, { accountability: { user: 'admin-id', admin: true }, database });

			expect(database.callCount).to.equal(0);
		});

		it('should validate the account on update too', async () => {
			first.resolves(undefined);

			const error = await Promise.resolve(callbacks.filter['gp_tokens.items.update']?.({ account_id: 'foreign-account-id' }, {}, { accountability, database })).catch(err => err);

			expect((error as Error).message).to.equal('You can not create a token for this account.');
		});

		it('should skip the check on update without account_id', async () => {
			await callbacks.filter['gp_tokens.items.update']?.({ name: 'renamed' }, {}, { accountability, database });

			expect(database.callCount).to.equal(0);
		});
	});
});
