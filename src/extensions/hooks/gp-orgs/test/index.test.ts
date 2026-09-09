import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any, meta: any, context: any) => Promise<any> | any;

describe('org hooks', () => {
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

	const read = (payload: any[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_orgs.items.read']?.(payload, {}, context);
	};

	beforeEach(() => {
		sinon.resetHistory();
		select.reset();
	});

	it('should keep the token for the orgs the user is an admin of and strip the others', async () => {
		select.resolves([{ org: 'org-1' }]);

		const payload = [
			{ id: 'org-1', name: 'mine', adoption_token: 'token-1' },
			{ id: 'org-2', name: 'foreign', adoption_token: 'token-2' },
		];

		await read(payload);

		expect(payload[0]).to.deep.equal({ id: 'org-1', name: 'mine', adoption_token: 'token-1' });
		expect(payload[1]).to.deep.equal({ id: 'org-2', name: 'foreign' });
	});

	it('should strip the token for a member', async () => {
		select.resolves([]);

		const payload = [{ id: 'org-1', name: 'org', adoption_token: 'token-1' }];

		await read(payload);

		expect(payload[0]).to.deep.equal({ id: 'org-1', name: 'org' });
	});

	it('should not touch the payload for internal reads', async () => {
		const payload = [{ id: 'org-1', adoption_token: 'token-1' }];

		await read(payload, { accountability: null, database });

		expect(payload[0]!.adoption_token).to.equal('token-1');
		expect(database.callCount).to.equal(0);
	});

	it('should not touch the payload for an admin', async () => {
		const payload = [{ id: 'org-1', adoption_token: 'token-1' }];

		await read(payload, { accountability: { user: 'admin-id', admin: true }, database });

		expect(payload[0]!.adoption_token).to.equal('token-1');
		expect(database.callCount).to.equal(0);
	});

	it('should not query the roles when no read org has the token', async () => {
		const payload = [{ id: 'org-1', name: 'org' }];

		await read(payload);

		expect(database.callCount).to.equal(0);
	});

	it('should strip the token when the org id is not in the read fields', async () => {
		select.resolves([]);

		const payload = [{ adoption_token: 'token-1' }];

		await read(payload);

		expect(payload[0]).to.deep.equal({});
	});
});
