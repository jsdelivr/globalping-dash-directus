import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any, meta: any, context: any) => Promise<void> | void;

describe('org members hooks', () => {
	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => {
			callbacks.filter[name] = cb;
		},
	} as any;

	hook(events, {} as HookExtensionContext);

	const select = sinon.stub();
	const queryBuilder = {
		whereIn: sinon.stub(),
		where: sinon.stub(),
		select,
	};
	queryBuilder.whereIn.returns(queryBuilder);
	queryBuilder.where.returns(queryBuilder);
	const database = sinon.stub().returns(queryBuilder);
	const accountability = { user: 'user-id', admin: false };

	const update = (payload: any, keys: string[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_org_members.items.update']?.(payload, { keys }, context);
	};

	beforeEach(() => {
		sinon.resetHistory();
		select.reset();
	});

	it('should allow an org admin to change a role', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'other-user-id' }]);
		select.onSecondCall().resolves([{ org: 'org-1' }]);

		await update({ role: 'member' }, [ 'm-1' ]);

		expect(select.callCount).to.equal(2);
	});

	it('should reject a role change by a non-admin', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'user-id' }]);
		select.onSecondCall().resolves([]);

		const error = await Promise.resolve(update({ role: 'admin' }, [ 'm-1' ])).catch(err => err);

		expect((error as Error).message).to.equal('Only an admin of the org can change roles.');
	});

	it('should reject a role change when the user is an admin of only some of the target orgs', async () => {
		select.onFirstCall().resolves([
			{ id: 'm-1', org: 'org-1', user: 'other-user-id' },
			{ id: 'm-2', org: 'org-2', user: 'other-user-id' },
		]);

		select.onSecondCall().resolves([{ org: 'org-1' }]);

		const error = await Promise.resolve(update({ role: 'member' }, [ 'm-1', 'm-2' ])).catch(err => err);

		expect((error as Error).message).to.equal('Only an admin of the org can change roles.');
	});

	it('should allow changing own notification preferences', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'user-id' }]);

		await update({ notification_preferences: { org_probe_offline: true } }, [ 'm-1' ]);

		expect(select.callCount).to.equal(1);
	});

	it('should reject changing notification preferences of another member', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'other-user-id' }]);

		const error = await Promise.resolve(update({ notification_preferences: {} }, [ 'm-1' ])).catch(err => err);

		expect((error as Error).message).to.equal('Notification preferences can only be changed on your own membership.');
	});

	it('should apply both rules when both fields are in the payload', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'other-user-id' }]);
		select.onSecondCall().resolves([{ org: 'org-1' }]);

		const error = await Promise.resolve(update({ role: 'member', notification_preferences: {} }, [ 'm-1' ])).catch(err => err);

		expect((error as Error).message).to.equal('Notification preferences can only be changed on your own membership.');
	});

	it('should skip the checks for an admin', async () => {
		await update({ role: 'admin' }, [ 'm-1' ], { accountability: { user: 'admin-id', admin: true }, database });

		expect(database.callCount).to.equal(0);
	});

	it('should do nothing when neither field is in the payload', async () => {
		await update({ }, [ 'm-1' ]);

		expect(database.callCount).to.equal(0);
	});
});
