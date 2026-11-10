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
		join: sinon.stub(),
		whereIn: sinon.stub(),
		where: sinon.stub(),
		select,
	};
	queryBuilder.join.returns(queryBuilder);
	queryBuilder.whereIn.returns(queryBuilder);
	queryBuilder.where.returns(queryBuilder);
	const database = sinon.stub().returns(queryBuilder);
	const accountability = { user: 'user-id', admin: false };

	const update = (payload: any, keys: string[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_org_members.items.update']?.(payload, { keys }, context);
	};

	const read = (payload: any[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_org_members.items.read']?.(payload, {}, context);
	};

	beforeEach(() => {
		sinon.resetHistory();
		select.reset();
	});

	it('should add the name of the member to every membership of the payload', async () => {
		select.resolves([{ id: 'm-1', github_username: 'alice' }, { id: 'm-2', github_username: 'bob' }]);

		const payload = [{ id: 'm-1', role: 'admin' }, { id: 'm-2', role: 'member' }];

		await read(payload);

		expect(queryBuilder.whereIn.firstCall.args).to.deep.equal([ 'gp_org_members.id', [ 'm-1', 'm-2' ] ]);
		expect(payload[0]).to.deep.equal({ id: 'm-1', role: 'admin', github_username: 'alice' });
		expect(payload[1]).to.deep.equal({ id: 'm-2', role: 'member', github_username: 'bob' });
	});

	it('should not read the database when the payload carries no membership id', async () => {
		const payload = [{ role: 'member' }];

		await read(payload);

		expect(select.callCount).to.equal(0);
		expect(payload[0]).to.deep.equal({ role: 'member' });
	});

	it('should not touch the payload for internal reads', async () => {
		const payload = [{ id: 'm-1' }];

		await read(payload, { accountability: null, database });

		expect(select.callCount).to.equal(0);
		expect(payload[0]).to.deep.equal({ id: 'm-1' });
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
		expect((error as { status: number }).status).to.equal(403);
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

		await update({ notification_preferences: { offline_probe: { enabled: true } } }, [ 'm-1' ]);

		expect(select.callCount).to.equal(1);
	});

	it('should reject changing notification preferences of another member', async () => {
		select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'other-user-id' }]);

		const error = await Promise.resolve(update({ notification_preferences: {} }, [ 'm-1' ])).catch(err => err);

		expect((error as Error).message).to.equal('Notification preferences can only be changed on your own membership.');
		expect((error as { status: number }).status).to.equal(403);
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

	it('should skip the checks for an internal call without accountability', async () => {
		await update({ role: 'admin' }, [ 'm-1' ], { accountability: null, database });
		expect(database.callCount).to.equal(0);
	});

	it('should do nothing when neither field is in the payload', async () => {
		await update({ }, [ 'm-1' ]);

		expect(database.callCount).to.equal(0);
	});

	describe('notification preferences shape', () => {
		beforeEach(() => {
			select.onFirstCall().resolves([{ id: 'm-1', org: 'org-1', user: 'user-id' }]);
		});

		it('should reject an unknown notification type', async () => {
			const error = await Promise.resolve(update({ notification_preferences: { unknown_type: { enabled: true } } }, [ 'm-1' ])).catch(err => err);

			expect((error as Error).message).to.include('"unknown_type" is not allowed');
		});

		it('should reject a value without enabled', async () => {
			const error = await Promise.resolve(update({ notification_preferences: { probe_adopted: { emailEnabled: true } } }, [ 'm-1' ])).catch(err => err);

			expect((error as Error).message).to.include('"probe_adopted.enabled" is required');
		});

		it('should fulfill the default parameter for enabled parameterized types', async () => {
			const payload = { notification_preferences: { low_credits: { enabled: true } } };

			await update(payload, [ 'm-1' ]);

			expect((payload.notification_preferences.low_credits as { parameter?: number }).parameter).to.be.a('number');
		});

		it('should accept null to reset the preferences', async () => {
			await update({ notification_preferences: null }, [ 'm-1' ]);
		});
	});
});
