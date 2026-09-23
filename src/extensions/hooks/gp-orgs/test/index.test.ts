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
	const first = sinon.stub();
	const queryBuilder = {
		join: sinon.stub(),
		whereIn: sinon.stub(),
		where: sinon.stub(),
		select,
		first,
	};
	queryBuilder.join.returns(queryBuilder);
	queryBuilder.whereIn.returns(queryBuilder);
	queryBuilder.where.returns(queryBuilder);
	const database = sinon.stub().returns(queryBuilder);
	const accountability = { user: 'user-id', admin: false };

	const read = (payload: any[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_orgs.items.read']?.(payload, {}, context);
	};

	const update = (payload: any, keys: string[] = [ 'org-1' ]) => {
		return callbacks.filter['gp_orgs.items.update']?.(payload, { keys }, { accountability, database });
	};

	const rejection = async (payload: any, keys?: string[]) => {
		const error = await Promise.resolve(update(payload, keys)).catch(err => err);
		expect((error as { status: number }).status).to.equal(400);
		return (error as Error).message;
	};

	const ALICE = { github_username: 'alice', token: 'alice-token' };
	const BOB = { github_username: 'bob', token: 'bob-token' };

	const stored = (...entries: object[]) => first.resolves({ extra_adoption_tokens: JSON.stringify(entries) });

	beforeEach(() => {
		sinon.resetHistory();
		select.reset();
		first.reset();
	});

	it('should add the token to the orgs the user is an admin of, and not to others', async () => {
		select.resolves([{ id: 'org-1', adoption_token: 'token-1', extra_adoption_tokens: '[{"github_username":"alice","token":"alice-token"}]' }]);

		const payload = [
			{ id: 'org-1', name: 'mine' },
			{ id: 'org-2', name: 'foreign' },
		];

		await read(payload);

		expect(payload[0]).to.deep.equal({
			id: 'org-1',
			name: 'mine',
			adoption_token: 'token-1',
			extra_adoption_tokens: [{ github_username: 'alice', token: 'alice-token' }],
		});

		expect(payload[1]).to.deep.equal({ id: 'org-2', name: 'foreign' });
	});

	it('should add nothing for a member', async () => {
		select.resolves([]);

		const payload = [{ id: 'org-1', name: 'org' }];

		await read(payload);

		expect(payload[0]).to.deep.equal({ id: 'org-1', name: 'org' });
	});

	it('should not touch the payload for internal reads', async () => {
		const payload = [{ id: 'org-1' }];

		await read(payload, { accountability: null, database });

		expect(payload[0]).to.deep.equal({ id: 'org-1' });
		expect(database.callCount).to.equal(0);
	});

	it('should not touch the payload for an admin', async () => {
		const payload = [{ id: 'org-1' }];

		await read(payload, { accountability: { user: 'admin-id', admin: true }, database });

		expect(payload[0]).to.deep.equal({ id: 'org-1' });
		expect(database.callCount).to.equal(0);
	});

	it('should not query the tokens when no read org has an id', async () => {
		const payload = [{ name: 'org' }];

		await read(payload);

		expect(payload[0]).to.deep.equal({ name: 'org' });
		expect(database.callCount).to.equal(0);
	});

	it('should accept removing an extra adoption token', async () => {
		stored(ALICE, BOB);

		await update({ extra_adoption_tokens: [ BOB ] });
	});

	it('should accept removing every entry', async () => {
		stored(ALICE, BOB);

		await update({ extra_adoption_tokens: [] });
	});

	it('should accept an update that does not touch the tokens', async () => {
		await update({ public_probes: true });

		expect(database.callCount).to.equal(0);
	});

	it('should reject adding an entry that is not stored', async () => {
		stored(ALICE);

		expect(await rejection({ extra_adoption_tokens: [ ALICE, BOB ] })).to.equal('"extra_adoption_tokens" accepts removals only.');
	});

	it('should reject repeating a stored entry to grow the list', async () => {
		stored(ALICE, BOB);

		expect(await rejection({ extra_adoption_tokens: [ ALICE, ALICE ] })).to.equal('"extra_adoption_tokens" accepts removals only.');
	});

	it('should reject an update that spans more than one org', async () => {
		const message = '"extra_adoption_tokens" can only be updated one org at a time.';

		expect(await rejection({ extra_adoption_tokens: [] }, [ 'org-1', 'org-2' ])).to.equal(message);
		expect(await rejection({ extra_adoption_tokens: [] }, [])).to.equal(message);
		expect(database.callCount).to.equal(0);
	});

	it('should reject a value that is not a list of the expected shape', async () => {
		for (const payload of [ 'alice-token', null, {}, [{ token: 'alice-token' }], [{ ...ALICE, note: 'extra' }], [ null ], [{ ...ALICE, token: 1 }] ]) {
			expect(await rejection({ extra_adoption_tokens: payload }), JSON.stringify(payload)).to.equal('"extra_adoption_tokens" must be a list of { github_username, token }.');
		}

		expect(database.callCount).to.equal(0);
	});
});
