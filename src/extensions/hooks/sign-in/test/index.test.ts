/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import hook from '../src/index.js';

describe('Sign-in hook', () => {
	const callbacks = {
		action: {},
	};
	const actions = {
		action: (name, cb) => {
			callbacks.action[name] = cb;
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

	it('should sync GitHub username and organizations if data is different', async () => {
		const userId = '123';
		const githubId = '456';

		itemsService.readOne.resolves({ id: userId, external_identifier: githubId, github_username: null, github_organizations: [] });

		nock('https://api.github.com')
			.get(`/user/${githubId}`)
			.reply(200, { login: 'newUsername' });

		nock('https://api.github.com')
			.get(`/user/${githubId}/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		hook(actions, context);

		await callbacks.action['auth.login']({ user: userId, provider: 'github' });

		expect(itemsService.readOne.callCount).to.equal(1);
		expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
		expect(nock.isDone()).to.equal(true);
		expect(usersService.updateOne.callCount).to.equal(2);
		expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_username: 'newUsername' }]);
		expect(usersService.updateOne.args[1]).to.deep.equal([ '123', { github_organizations: [ 'jsdelivr' ] }]);
	});

	it('should not update username if it is the same', async () => {
		const userId = '123';
		const githubId = '456';

		itemsService.readOne.resolves({ id: userId, external_identifier: githubId, github_username: 'oldUsername', github_organizations: [] });

		nock('https://api.github.com')
			.get(`/user/${githubId}`)
			.reply(200, { login: 'oldUsername' });

		nock('https://api.github.com')
			.get(`/user/${githubId}/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		hook(actions, context);

		await callbacks.action['auth.login']({ user: userId, provider: 'github' });

		expect(itemsService.readOne.callCount).to.equal(1);
		expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
		expect(nock.isDone()).to.equal(true);
		expect(usersService.updateOne.callCount).to.equal(1);
		expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_organizations: [ 'jsdelivr' ] }]);
	});

	it('should not update organizations if it is the same', async () => {
		const userId = '123';
		const githubId = '456';

		itemsService.readOne.resolves({ id: userId, external_identifier: githubId, github_username: 'oldUsername', github_organizations: [ 'jsdelivr' ] });

		nock('https://api.github.com')
			.get(`/user/${githubId}`)
			.reply(200, { login: 'newUsername' });

		nock('https://api.github.com')
			.get(`/user/${githubId}/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		hook(actions, context);

		await callbacks.action['auth.login']({ user: userId, provider: 'github' });

		expect(itemsService.readOne.callCount).to.equal(1);
		expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
		expect(nock.isDone()).to.equal(true);
		expect(usersService.updateOne.callCount).to.equal(1);
		expect(usersService.updateOne.args[0]).to.deep.equal([ '123', { github_username: 'newUsername' }]);
	});

	it('should send error if there is no enough data to check username', async () => {
		const userId = '123';

		itemsService.readOne.resolves({ external_identifier: null });

		hook(actions, context);

		const error = await callbacks.action['auth.login']({ user: userId, provider: 'github' }).catch(err => err);
		expect(error.message).to.equal('Not enough data to sync with GitHub');

		expect(itemsService.readOne.callCount).to.equal(1);
		expect(itemsService.readOne.args[0]).to.deep.equal([ userId ]);
	});
});
