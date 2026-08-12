import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type ActionCallback = (meta: any) => Promise<void>;
type FilterCallback = (payload: any, meta: any) => Promise<void>;

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
	const context = {
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return itemsService;
			}),
			UsersService: sinon.stub().callsFake(() => {
				return usersService;
			}),
			NotificationsService: sinon.stub().callsFake(() => {
				return notificationsService;
			}),
		},
		env: {
			GITHUB_ACCESS_TOKEN: 'default-github-token',
			DASH_URL: 'https://dash.globalping.io',
			PUBLIC_URL: 'https://dash-directus.globalping.io',
			SECRET: 'test-secret',
		},
		database: {
			transaction: async (callback: (trx: unknown) => unknown) => callback({}),
		},
		getSchema: () => Promise.resolve({}),
		logger: {
			error: sinon.stub(),
		},
	} as any;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
		itemsService.readByQuery.resolves([]);
		itemsService.createOne.resolves('created-id');
		itemsService.deleteMany.resolves();
	});

	afterEach(() => {
		nock.cleanAll();
	});

	// The sync runs in the background, so tests wait for its observable side effects instead of awaiting it.
	const waitFor = async (condition: () => boolean) => {
		for (let i = 0; i < 100 && !condition(); i++) {
			await new Promise(resolve => setTimeout(resolve, 5));
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

		it('should not update the organizations list if it is the same', async () => {
			itemsService.readOne.resolves({ id: '123', external_identifier: '456', github_username: 'oldUsername', github_organizations: [ 'jsdelivr' ], github_oauth_token: 'user-github-token' });

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
			await waitFor(() => nock.isDone());

			expect(nock.isDone()).to.equal(true);
			expect(itemsService.createOne.callCount).to.equal(0);
			expect(usersService.updateOne.callCount).to.equal(0);
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
	});
});
