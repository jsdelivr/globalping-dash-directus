/* eslint-disable @typescript-eslint/no-explicit-any */
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
	};
	const usersService = {
		updateOne: sinon.stub(),
	};
	const context = {
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return itemsService;
			}),
			UsersService: sinon.stub().callsFake(() => {
				return usersService;
			}),
		},
		env: {
			GITHUB_ACCESS_TOKEN: 'fakeToken',
		},
		database: {},
		getSchema: () => Promise.resolve({}),
		logger: {
			error: () => {},
		},
	} as any;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

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
					accessToken: '123',
					userInfo: { login: 'testUser' },
				},
			});

			expect(payload).to.deep.include({
				auth_data: undefined,
				github_username: 'testUser',
				github_oauth_token: '123',
			});
		});
	});

	describe('auth.update', () => {
		it('should fulfill github_username and github_oauth_token', async () => {
			const payload = { auth_data: undefined };

			hook(events, context);

			callbacks.filter['auth.create']?.(payload, {
				provider: 'github',
				providerPayload: {
					accessToken: '123',
					userInfo: { login: 'testUser' },
				},
			});

			expect(payload).to.deep.include({
				auth_data: undefined,
				github_username: 'testUser',
				github_oauth_token: '123',
			});
		});
	});

	describe('auth.login', () => {
		it('should sync GitHub username and organizations if data is different', async () => {
			const userId = '123';
			const githubId = '456';

			itemsService.readOne.resolves({ id: userId, external_identifier: githubId, github_username: null, github_organizations: [], github_oauth_token: '123' });

			nock('https://api.github.com')
				.get(`/user/${githubId}/orgs`)
				.reply(200, [{ login: 'jsdelivr' }]);

			hook(events, context);

			await callbacks.action['auth.login']?.({ user: userId, provider: 'github' });

			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
			expect(nock.isDone()).to.equal(true);
			expect(usersService.updateOne.callCount).to.equal(1);
			expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_organizations: [ 'jsdelivr' ] }]);
		});

		it('should not update organizations if it is the same', async () => {
			const userId = '123';
			const githubId = '456';

			itemsService.readOne.resolves({ id: userId, external_identifier: githubId, github_username: 'oldUsername', github_organizations: [ 'jsdelivr' ], github_oauth_token: '123' });

			nock('https://api.github.com')
				.get(`/user/${githubId}/orgs`)
				.reply(200, [{ login: 'jsdelivr' }]);

			hook(events, context);

			await callbacks.action['auth.login']?.({ user: userId, provider: 'github' });

			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
			expect(nock.isDone()).to.equal(true);
			expect(usersService.updateOne.callCount).to.equal(0);
		});

		it('should send error if there is no enough data to check username', async () => {
			const userId = '123';

			itemsService.readOne.resolves({ external_identifier: null });

			hook(events, context);

			const error = await callbacks.action['auth.login']?.({ user: userId, provider: 'github' }).catch(err => err);
			expect(error.message).to.equal('Not enough data to sync with GitHub');

			expect(itemsService.readOne.callCount).to.equal(1);
			expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
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
	});
});
