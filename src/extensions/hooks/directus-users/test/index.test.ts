import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { SYSTEM_USER_ID } from '../../../lib/src/constants.js';
import defineHook, { deleteUserIdToGithubId } from '../src/index.js';

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
	const updateSystemUserToken = sinon.stub();
	const whereSystemUser = sinon.stub().returns({ update: updateSystemUserToken });

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
		database: sinon.stub().returns({ where: whereSystemUser }),
		getSchema: sinon.stub(),
		env: {},
	} as unknown as HookExtensionContext;

	defineHook(events, context);

	beforeEach(() => {
		sinon.resetHistory();
		context.env = {};
	});

	describe('server.start', () => {
		it('should update system user token from env', async () => {
			context.env.GP_SYSTEM_KEY = 'new-system-token';

			await callbacks.action['server.start']?.({}, {});

			expect(whereSystemUser.callCount).to.equal(1);
			expect(whereSystemUser.args[0]?.[0]).to.deep.equal({ id: SYSTEM_USER_ID });
			expect(updateSystemUserToken.callCount).to.equal(1);
			expect(updateSystemUserToken.args[0]?.[0]).to.deep.equal({ token: 'new-system-token' });
		});

		it('should skip system user token update if env token is missing', async () => {
			await callbacks.action['server.start']?.({}, {});

			expect(whereSystemUser.callCount).to.equal(0);
			expect(updateSystemUserToken.callCount).to.equal(0);
		});
	});

	describe('users.delete', () => {
		beforeEach(() => {
			deleteUserIdToGithubId.clear();
		});

		it('should additionally delete user credits additions', async () => {
			usersService.readByQuery.resolves([{ id: '1-1-1-1-1', external_identifier: '123' }]);
			const context = { accountability: { user: 'userIdValue' } };

			await callbacks.filter['users.delete']?.([ '1-1-1-1-1' ], {}, context);
			await callbacks.action['users.delete']?.({ keys: [ '1-1-1-1-1' ] }, context);

			expect(creditsAdditionsService.deleteByQuery.args[0]).to.deep.equal([{ filter: { github_id: { _in: [ '123' ] } } }]);
		});

		it('should do nothing if read query returned nothing', async () => {
			usersService.readByQuery.resolves([]);

			await callbacks.filter['users.delete']?.([ '1-1-1-1-1' ], {}, context);
			await callbacks.action['users.delete']?.({ keys: [ '1-1-1-1-1' ] }, context);

			expect(creditsAdditionsService.deleteByQuery.callCount).to.deep.equal(0);
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

		it('should throw error if notification_preferences has invalid type key', async () => {
			const err = await callbacks.filter['users.update']?.(
				{ notification_preferences: { not_existing_type: { enabled: true, emailEnabled: true } } },
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: { user: 'userIdValue' } },
			).catch(err => err);

			expect(err.message).to.contain('"notification_preferences.not_existing_type" is not allowed');
		});

		it('should force enabled true for readOnly notification', async () => {
			const payload = {
				notification_preferences: {
					outdated_software: { enabled: false, emailEnabled: false },
				},
			};

			await callbacks.filter['users.update']?.(
				payload,
				{ keys: [ '1-1-1-1-1' ] },
				{ accountability: { user: 'userIdValue' } },
			);

			expect(payload.notification_preferences.outdated_software.enabled).to.equal(true);
			expect(payload.notification_preferences.outdated_software.emailEnabled).to.equal(false);
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
