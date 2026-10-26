import { RecordNotUniqueError } from '@directus/errors';
import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type ActionCallback = (meta: any) => Promise<void>;
type FilterCallback = (payload: any, meta: any) => Promise<any>;

describe('Sign-in hook', () => {
	const callbacks = {
		action: {} as Record<string, ActionCallback>,
		filter: {} as Record<string, FilterCallback>,
	};
	const events = {
		action: (name: string, cb: ActionCallback) => {
			callbacks.action[name] = cb;
		},
		filter: (name: string, cb: FilterCallback) => {
			callbacks.filter[name] = cb;
		},
	} as any;
	const itemsService = {
		readOne: sinon.stub(),
		readByQuery: sinon.stub(),
		createOne: sinon.stub(),
		updateOne: sinon.stub(),
		deleteMany: sinon.stub(),
	};
	const usersService = {
		updateOne: sinon.stub(),
		updateByQuery: sinon.stub(),
	};
	const notificationsService = {
		createOne: sinon.stub(),
	};
	const rawStub = sinon.stub();
	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'raw') {
				return rawStub;
			} else if (property === 'transaction') {
				return async (callback: (trx: unknown) => unknown) => callback({});
			}

			return database;
		},
	});
	const context = {
		services: {
			ItemsService: sinon.stub(),
			UsersService: sinon.stub(),
			NotificationsService: sinon.stub(),
		},
		env: {
			GITHUB_ACCESS_TOKEN: 'default-github-token',
			DASH_URL: 'https://dash.globalping.io',
			PUBLIC_URL: 'https://dash-directus.globalping.io',
			SECRET: 'test-secret',
		},
		database,
		getSchema: () => Promise.resolve({}),
		logger: {
			error: sinon.stub(),
		},
	} as any;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.reset();
		context.services.ItemsService.returns(itemsService);
		context.services.UsersService.returns(usersService);
		context.services.NotificationsService.returns(notificationsService);
		itemsService.readByQuery.resolves([]);
		itemsService.createOne.resolves('created-id');
		itemsService.deleteMany.resolves();
		rawStub.resolves([ [] ]);
	});

	afterEach(() => {
		nock.cleanAll();
	});

	// The sync runs in the background, so tests wait for its observable side effects instead of awaiting it.
	const waitFor = async (condition: () => boolean) => {
		for (let i = 0; i < 100 && !condition(); i++) {
			await new Promise(resolve => setTimeout(resolve, 5));
		}

		if (!condition()) {
			throw new Error('Timed out waiting for background sync.');
		}
	};

	after(() => {
		nock.cleanAll();
	});

	describe('auth.create', () => {
		it('should fulfill github_username and github_oauth_token', async () => {
			const payload = { auth_data: undefined };

			hook(events, context);

			callbacks.filter['auth.create']?.(payload, {
				provider: 'github',
				providerPayload: {
					accessToken: 'user-github-token',
					userInfo: { login: 'testUser' },
				},
			});

			expect(payload).to.deep.include({
				auth_data: undefined,
				github_username: 'testUser',
				github_oauth_token: 'user-github-token',
			});
		});
	});

	describe('auth.update', () => {
		it('should fulfill github_username and github_oauth_token', async () => {
			const payload = { auth_data: undefined };

			hook(events, context);

			callbacks.filter['auth.update']?.(payload, {
				provider: 'github',
				providerPayload: {
					accessToken: 'user-github-token',
					userInfo: { login: 'testUser' },
				},
			});

			expect(payload).to.deep.include({
				auth_data: undefined,
				github_username: 'testUser',
				github_oauth_token: 'user-github-token',
			});
		});
	});

	describe('auth.jwt background sync', () => {
		const loginMeta = { user: '123', provider: 'github' };

		it('should sync orgs, memberships and the organizations list on login', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: null, github_organizations: [], github_oauth_token: 'user-github-token' });

			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer user-github-token')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => usersService.updateOne.callCount === 1);

			expect(itemsService.readOne.calledWith('123', {}, { emitEvents: false })).to.equal(true);
			expect(nock.isDone()).to.equal(true);

			// The org and the membership are created.
			expect(itemsService.createOne.args[0]?.[0]).to.deep.include({ name: 'jsdelivr', github_id: '1' });
			expect(itemsService.createOne.args[1]?.[0]).to.deep.include({ org: 'created-id', user: '123', role: 'admin' });

			// The legacy organizations list is updated.
			expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_organizations: [ 'jsdelivr' ] }]);
		});

		it('should use the org created by a concurrent sync of another member', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: null, github_organizations: [], github_oauth_token: 'user-github-token' });

			nock('https://api.github.com')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			// The org is missing on the first read, but exists by the time it is created.
			itemsService.createOne.onFirstCall().rejects(new RecordNotUniqueError({ collection: 'gp_orgs', field: 'github_id', value: '1' }));
			itemsService.readByQuery.onSecondCall().resolves([{ id: 'winner-id', name: 'jsdelivr', github_id: '1' }]);

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => usersService.updateOne.callCount === 1);

			expect(itemsService.createOne.args[1]?.[0]).to.deep.include({ org: 'winner-id', user: '123', role: 'admin' });
		});

		it('should keep going when a parallel sync of the same user created the membership first', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: null, github_organizations: [], github_oauth_token: 'user-github-token' });

			nock('https://api.github.com')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			itemsService.createOne.onSecondCall().rejects(new RecordNotUniqueError({ collection: 'gp_org_members', field: 'org', value: 'created-id' }));

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => usersService.updateOne.callCount === 1);

			expect(itemsService.createOne.callCount).to.equal(2);
			expect(context.logger.error.callCount).to.equal(0);
		});

		it('should run the same sync on a token refresh, not only on login', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: null, github_organizations: [], github_oauth_token: 'user-github-token' });

			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer user-github-token')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'admin', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			hook(events, context);

			// auth.jwt fires on refresh too; the hook does not gate on meta.type, so the full sync runs all the same.
			await callbacks.filter['auth.jwt']?.({ id: '123' }, { ...loginMeta, type: 'refresh' });
			await waitFor(() => usersService.updateOne.callCount === 1);

			expect(nock.isDone()).to.equal(true);
			expect(itemsService.createOne.args[0]?.[0]).to.deep.include({ name: 'jsdelivr', github_id: '1' });
			expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_organizations: [ 'jsdelivr' ] }]);
		});

		it('should not update the organizations list if it is the same', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: 'oldUsername', github_organizations: [ 'jsdelivr' ], github_oauth_token: 'user-github-token', default_prefix: 'staleUsername', public_probes: false });

			itemsService.readByQuery.onFirstCall().resolves([{ id: 'org-id', name: 'jsdelivr', github_id: '1' }]);
			itemsService.readByQuery.onSecondCall().resolves([{ id: 'membership-id', role: 'member', org: { github_id: '1' } }]);
			itemsService.readByQuery.onThirdCall().resolves([{ id: 'membership-id', role: 'member', org: { github_id: '1' } }]);

			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer user-github-token')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			// Prefix repair happens after org sync, giving this otherwise read-only path a completion signal.
			await waitFor(() => usersService.updateOne.callCount === 1);

			expect(nock.isDone()).to.equal(true);
			expect(itemsService.createOne.callCount).to.equal(0);
			expect(usersService.updateOne.args).to.deep.equal([ [ '123', { default_prefix: 'oldUsername' }, { emitEvents: false }] ]);
		});

		it('should deprecate an invalid default_prefix and notify the user', async () => {
			itemsService.readOne.resolves({
				id: '123',
				external_identifier: '456',
				github_username: 'newUsername',
				github_organizations: [ 'jsdelivr' ],
				github_oauth_token: 'user-github-token',
				default_prefix: 'oldUsername',
				deprecated_prefix: null,
				public_probes: true,
			});

			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer user-github-token')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(200, [{ state: 'active', role: 'member', organization: { id: 1, login: 'jsdelivr' } }]);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, []);

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => notificationsService.createOne.callCount === 1);

			expect(nock.isDone()).to.equal(true);

			expect(usersService.updateOne.args[0]).to.deep.equal([ '123', {
				default_prefix: 'newUsername',
				deprecated_prefix: 'oldUsername',
			}, { emitEvents: false }]);

			expect(notificationsService.createOne.args[0]?.[0]).to.include({
				recipient: '123',
				type: 'default_tag_change',
			});
		});

		it('should log the error if the user token is invalid', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: 'oldUsername', github_organizations: [ 'jsdelivr' ], github_oauth_token: 'user-github-token' });

			nock('https://api.github.com')
				.matchHeader('Authorization', 'Bearer user-github-token')
				.get(`/user/memberships/orgs?per_page=100&page=1`)
				.reply(401);

			nock('https://api.github.com').get(`/user/456/orgs?per_page=100&page=1`).reply(200, [{ id: 1, login: 'jsdelivr' }]);

			hook(events, context);

			const payload = await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => context.logger.error.callCount === 1);

			// The token is still issued, the failure is only logged.
			expect(payload).to.deep.include({ id: '123' });
			expect(context.logger.error.args[0]?.[0].message).to.equal('Failed to get the GitHub data (401). Please sign out and sign in again.');
			expect(usersService.updateOne.callCount).to.equal(0);
		});

		it('should log the error if there is not enough data to sync', async () => {
			itemsService.readOne.resolves({ external_identifier: null });

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, loginMeta);
			await waitFor(() => context.logger.error.callCount === 1);

			expect(context.logger.error.args[0]?.[0].message).to.equal('Not enough data to sync with GitHub');
		});

		it('should not sync for a non-github provider', async () => {
			itemsService.readOne.resolves({ id: '123', user_type: 'member' });

			hook(events, context);

			await callbacks.filter['auth.jwt']?.({ id: '123' }, { user: '123', provider: 'default' });
			await new Promise(resolve => setTimeout(resolve, 50));

			// Only the claims read happened, no sync read with emitEvents: false.
			expect(itemsService.readOne.calledWith('123', {}, { emitEvents: false })).to.equal(false);
		});
	});

	describe('auth.jwt', () => {
		it('should not modify payload if user is not found', async () => {
			const payload = { id: '123' };
			const meta = { user: 'non-existent-user-id' };

			itemsService.readOne.resolves(undefined);

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.(payload, meta);
			expect(result).to.deep.equal(payload);
			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ 'non-existent-user-id' ]);
		});

		it('should not modify payload if user has no GitHub username', async () => {
			const payload = { id: '123' };
			const meta = { user: 'user-id-without-github-username' };

			itemsService.readOne.resolves({
				id: 'user-id',
				github_username: null,
				github_organizations: [],
			});

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.(payload, meta);
			expect(result).to.deep.equal(payload); // Payload should remain unchanged
			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ 'user-id-without-github-username' ]);
		});

		it('should add github_username to payload if user has a GitHub username', async () => {
			const payload = { id: '123' };
			const meta = { user: 'user-with-github-username' };

			itemsService.readOne.resolves({
				id: 'user-id',
				github_username: 'testUser',
				github_organizations: [],
			});

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.(payload, meta);
			expect(result).to.deep.equal({
				...payload,
				github_username: 'testUser',
			});

			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ 'user-with-github-username' ]);
		});

		it('should add user_type to payload', async () => {
			const payload = { id: '123' };
			const meta = { user: 'user-with-user-type' };

			itemsService.readOne.resolves({
				id: 'user-id',
				user_type: 'member',
			});

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.(payload, meta);
			expect(result).to.deep.equal({
				...payload,
				user_type: 'member',
			});

			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ 'user-with-user-type' ]);
		});

		it('should add user_account_id to payload', async () => {
			const payload = { id: '123' };
			const meta = { user: 'user-with-account' };

			itemsService.readOne.resolves({
				id: 'user-id',
				account: [ 'account-id' ],
			});

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.(payload, meta);
			expect(result).to.deep.equal({
				...payload,
				user_account_id: 'account-id',
				active_account_id: 'account-id',
				active_account_role: 'owner',
			});
		});
	});

	describe('auth.jwt active account', () => {
		const payload = { id: '123', session: 'new-session-token' };

		beforeEach(() => {
			itemsService.readOne.resolves({ id: '123', account: [ 'account-id' ] });
		});

		it('should copy the stored account to the new session and emit its claims on refresh', async () => {
			rawStub.onFirstCall().resolves([ [{ active_account: 'org-account-id' }] ]);
			rawStub.onSecondCall().resolves([ [{ role: 'member' }] ]);

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.({ ...payload }, { user: '123', type: 'refresh' });

			expect(rawStub.thirdCall.args[1]).to.deep.equal({ account: 'org-account-id', token: 'new-session-token' });
			expect(result).to.deep.include({ active_account_id: 'org-account-id', active_account_role: 'member' });
		});

		it('should fall back to the personal account on refresh when the membership is lost', async () => {
			rawStub.onFirstCall().resolves([ [{ active_account: 'org-account-id' }] ]);
			rawStub.onSecondCall().resolves([ [] ]);

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.({ ...payload }, { user: '123', type: 'refresh' });

			expect(result).to.deep.include({ active_account_id: 'account-id', active_account_role: 'owner' });
		});

		it('should ignore the old session account on login and on a refresh without a session claim (JSON mode)', async () => {
			rawStub.resolves([ [{ active_account: 'org-account-id', role: 'member' }] ]);

			hook(events, context);

			for (const [ jwtPayload, type ] of [ [{ ...payload }, 'login' ], [{ id: '123' }, 'refresh' ] ] as const) {
				const result = await callbacks.filter['auth.jwt']?.(jwtPayload, { user: '123', type });

				expect(result).to.deep.include({ active_account_id: 'account-id', active_account_role: 'owner' });
			}
		});

		it('should emit no active account claims without user_account_id', async () => {
			itemsService.readOne.resolves({ id: '123' });

			hook(events, context);

			const result = await callbacks.filter['auth.jwt']?.({ ...payload }, { user: '123', type: 'login' });

			expect(result).to.not.have.any.keys('active_account_id', 'active_account_role');
		});
	});
});
