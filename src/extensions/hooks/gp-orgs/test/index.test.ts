import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any, meta: any, context: any) => Promise<any> | any;

describe('org hooks', () => {
	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
		action: {} as Record<string, (meta: any) => Promise<void>>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => {
			callbacks.filter[name] = cb;
		},
		action: (name: string, cb: (meta: any) => Promise<void>) => {
			callbacks.action[name] = cb;
		},
	} as any;

	const deleteMany = sinon.stub().resolves();
	const FilesService = sinon.stub().returns({ deleteMany });

	hook(events, { services: { FilesService }, getSchema: async () => ({}) } as unknown as HookExtensionContext);

	const select = sinon.stub();
	const first = sinon.stub();
	const queryBuilder = {
		join: sinon.stub(),
		whereIn: sinon.stub(),
		where: sinon.stub(),
		whereNotNull: sinon.stub(),
		select,
		first,
	};
	queryBuilder.join.returns(queryBuilder);
	queryBuilder.whereIn.returns(queryBuilder);
	queryBuilder.where.returns(queryBuilder);
	queryBuilder.whereNotNull.returns(queryBuilder);
	const database = sinon.stub().returns(queryBuilder);
	const accountability = { user: 'user-id', admin: false };

	const read = (payload: any[], context: any = { accountability, database }) => {
		return callbacks.filter['gp_orgs.items.read']?.(payload, {}, context);
	};

	const update = (payload: any, keys: string[] = [ 'org-1' ]) => {
		return callbacks.filter['gp_orgs.items.update']?.(payload, { keys }, { accountability, database });
	};

	const rejection = async (payload: any, keys?: string[]) => {
		const error = await Promise.resolve().then(() => update(payload, keys)).catch(err => err);
		expect((error as { status: number }).status).to.equal(400);
		return (error as Error).message;
	};

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

	it('should reject a website that the URL parser rejects, on create and update', async () => {
		await update({ website: 'https://example.com:8443/x' });
		await update({ website: null });
		await update({ public_probes: true });
		expect(database.callCount).to.equal(0);
		expect(await rejection({ website: 'https://example.com:abc' })).to.equal('"website" must be a valid https:// URL.');
		expect(() => callbacks.filter['gp_orgs.items.create']?.({ website: 'https://example.com:abc' }, {}, { accountability, database })).to.throw('"website" must be a valid https:// URL.');
	});

	const deleteOrgs = async (keys: string[]) => {
		await callbacks.filter['gp_orgs.items.delete']?.(keys, {}, { accountability, database });
		await callbacks.action['gp_orgs.items.delete']?.({ keys });
	};

	it('should delete the banners of the deleted orgs after the orgs are deleted', async () => {
		select.resolves([{ id: 'org-1', banner: 'banner-1' }, { id: 'org-2', banner: 'banner-2' }]);
		const keys = [ 'org-1', 'org-2', 'org-3' ];

		await deleteOrgs(keys);
		expect(queryBuilder.whereIn.args[0]).to.deep.equal([ 'id', keys ]);
		expect(queryBuilder.whereNotNull.args[0]).to.deep.equal([ 'banner' ]);
		expect(deleteMany.args).to.deep.equal([ [ [ 'banner-1', 'banner-2' ] ] ]);
	});

	it('should delete nothing in the filter, which runs before the access check', async () => {
		select.resolves([{ id: 'org-1', banner: 'banner-1' }]);
		const keys = [ 'org-1' ];

		await callbacks.filter['gp_orgs.items.delete']?.(keys, {}, { accountability, database });
		expect(deleteMany.callCount).to.equal(0);

		await callbacks.action['gp_orgs.items.delete']?.({ keys });
		expect(deleteMany.args).to.deep.equal([ [ [ 'banner-1' ] ] ]);
	});

	it('should not delete files when the deleted orgs have no banners', async () => {
		select.resolves([]);

		await deleteOrgs([ 'org-1' ]);

		expect(deleteMany.callCount).to.equal(0);
	});

	it('should not delete files twice for a repeated action', async () => {
		select.resolves([{ id: 'org-1', banner: 'banner-1' }]);
		const keys = [ 'org-1' ];

		await deleteOrgs(keys);
		await callbacks.action['gp_orgs.items.delete']?.({ keys });

		expect(deleteMany.callCount).to.equal(1);
	});
});
