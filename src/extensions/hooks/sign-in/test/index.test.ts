/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import hook from '../src/index.js';

const callbacks = {
	action: {},
};
const actions = {
	action: (name, cb) => {
		callbacks.action[name] = cb;
	},
} as any;
const createOne = sinon.stub();
const readOne = sinon.stub();
const context = {
	services: {
		ItemsService: sinon.stub().callsFake(() => {
			return { readOne };
		}),
		NotificationsService: sinon.stub().callsFake(() => {
			return { createOne };
		}),
	},
	env: {
		GITHUB_ACCESS_TOKEN: 'fakeToken',
	},
	database: {},
	getSchema: () => Promise.resolve({}),
} as any;

describe('syncGithubLogin hook', () => {
	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	after(() => {
		nock.cleanAll();
	});

	it('should sync GitHub login and send notification if username is different', async () => {
		const userId = '123';
		const githubId = '456';
		const username = 'oldUsername';
		const githubUsername = 'newUsername';

		readOne.resolves({ external_identifier: githubId, github: username });

		nock('https://api.github.com')
			.get(`/user/${githubId}`)
			.reply(200, { login: githubUsername });

		hook(actions, context);

		await callbacks.action['auth.login']({ user: userId });

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]).to.deep.equal([ userId ]);
		expect(nock.isDone()).to.equal(true);
		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([
			{
				recipient: userId,
				subject: 'Github username update',
				message: `Looks like your GitHub username was updated from "${username}" to "${githubUsername}". Tags of the adopted probes are constructed as \`u-\${githubUsername}-\${tagValue}\`. If you want tags to use the new value click "Sync GitHub Username" button on the [user page](/admin/users/${userId}).`,
			},
		]);
	});

	it('should not send notification if username is the same', async () => {
		const userId = '123';
		const githubId = '456';
		const username = 'sameUsername';

		readOne.resolves({ external_identifier: githubId, github: username });

		nock('https://api.github.com')
			.get(`/user/${githubId}`)
			.reply(200, { login: username });

		hook(actions, context);

		await callbacks.action['auth.login']({ user: userId });

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]).to.deep.equal([ userId ]);
		expect(nock.isDone()).to.equal(true);
		expect(createOne.callCount).to.equal(0);
	});

	it('should send error if there is no enough data to check username', async () => {
		const userId = '123';
		const githubId = '456';

		readOne.resolves({ external_identifier: githubId });

		hook(actions, context);

		const error = await callbacks.action['auth.login']({ user: userId }).catch(err => err);
		expect(error.message).to.equal('Not enough data to check GitHub username');

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]).to.deep.equal([ userId ]);
		expect(createOne.callCount).to.equal(0);
	});
});
