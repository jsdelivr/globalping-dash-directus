import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import defineHook from '../src/index.js';

type FilterCallback = (payload: any, meta: any, context: any) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('users hooks', () => {
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

	const usersService = {
		readByQuery: sinon.stub(),
	};

	const creditsAdditionsService = {
		deleteByQuery: sinon.stub(),
	};

	const context = {
		services: {
			ItemsService: sinon.stub().callsFake((collection) => {
				switch (collection) {
					case 'directus_users':
						return usersService;
					case 'gp_credits_additions':
						return creditsAdditionsService;
					default:
						throw new Error('Collection name wasn\'t provided');
				}
			}),
		},
		database: sinon.stub(),
		getSchema: sinon.stub(),
	} as unknown as HookExtensionContext;

	defineHook(events, context);

	beforeEach(() => {
		sinon.resetHistory();
	});

	describe('users.delete', () => {
		it('should additionally delete user credits additions', async () => {
			usersService.readByQuery.resolves([{ id: '1-1-1-1-1', external_identifier: '123' }]);

			await callbacks.filter['users.delete']?.([ '1-1-1-1-1' ], {}, { accountability: { user: 'userIdValue' } });

			expect(creditsAdditionsService.deleteByQuery.args[0]).to.deep.equal([{ filter: { github_id: { _in: [ '123' ] } } }]);
		});

		it('should do nothing if read query returned nothing', async () => {
			usersService.readByQuery.resolves([]);

			await callbacks.filter['users.delete']?.([ '1-1-1-1-1' ], {}, { accountability: { user: 'userIdValue' } });

			expect(creditsAdditionsService.deleteByQuery.callCount).to.deep.equal(0);
		});

		it('should throw if accountability was not provided', async () => {
			usersService.readByQuery.resolves([{ id: '1-1-1-1-1', external_identifier: '123' }]);

			const err = await callbacks.filter['users.delete']?.([ '1-1-1-1-1' ], {}, { accountability: null }).catch(err => err);

			expect(err.message).to.equal('User is not authenticated');
		});
	});

	describe('users.update', () => {
		it('should allow updating default_prefix', async () => {
			usersService.readByQuery.resolves([{
				id: '1-1-1-1-1',
				github_username: 'testuser',
				github_organizations: [ 'org1', 'org2' ],
			}]);

			await callbacks.filter['users.update']?.(
				{ default_prefix: 'testuser' },
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: { user: 'userIdValue' } },
			);

			expect(usersService.readByQuery.args[0]).to.deep.equal([{
				filter: { id: { _in: [ '1-1-1-1-1' ] } },
			}]);
		});

		it('should throw error if default_prefix is not valid', async () => {
			usersService.readByQuery.resolves([{
				id: '1-1-1-1-1',
				github_username: 'testuser',
				github_organizations: [ 'org1', 'org2' ],
			}]);

			const err = await callbacks.filter['users.update']?.(
				{ default_prefix: 'invalid-prefix' },
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: { user: 'userIdValue' } },
			).catch(err => err);

			expect(err.message).to.equal('"value" must be one of [testuser, org1, org2]');
		});

		it('should do nothing if default_prefix is not being updated', async () => {
			await callbacks.filter['users.update']?.(
				{ email: 'test@example.com' },
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: { user: 'userIdValue' } },
			);

			expect(usersService.readByQuery.callCount).to.equal(0);
		});

		it('should do nothing if user is not authenticated', async () => {
			await callbacks.filter['users.update']?.(
				{ lastPage: '/settings' },
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: undefined },
			);
		});
	});
});
