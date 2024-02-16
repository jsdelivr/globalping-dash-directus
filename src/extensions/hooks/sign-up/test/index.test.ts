/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import hook from '../src/index.js';

describe('Sign-up hook', () => {
	const callbacks = {
		filter: {},
		action: {},
	};
	const hooks = {
		filter: (name, cb) => {
			callbacks.filter[name] = cb;
		},
		action: (name, cb) => {
			callbacks.action[name] = cb;
		},
	} as any;
	const creditsService = {
		readByQuery: sinon.stub().resolves([]),
		createOne: sinon.stub(),
	};
	const creditsAdditionsService = {
		readByQuery: sinon.stub().resolves([]),
		updateByQuery: sinon.stub(),
	};
	const sponsorsService = {
		readByQuery: sinon.stub().resolves([]),
	};
	const usersService = {
		updateOne: sinon.stub(),
	};
	const context = {
		services: {
			ItemsService: sinon.stub().callsFake((collection) => {
				switch (collection) {
					case 'gp_credits':
						return creditsService;
					case 'gp_credits_additions':
						return creditsAdditionsService;
					case 'sponsors':
						return sponsorsService;
					default:
						throw new Error('Collection name wasn\'t provided');
				}
			}),
			UsersService: sinon.stub().callsFake(() => {
				return usersService;
			}),
		},
		env: {
			GITHUB_ACCESS_TOKEN: 'fakeToken',
		},
		database: {
			transaction: async (f) => {
				return f({});
			},
		},
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

	it('filter should fulfill first_name, last_name, github_username', async () => {
		nock('https://api.github.com')
			.get(`/user/1834071/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		hook(hooks, context);

		const payload = {
			provider: 'github',
			external_identifier: 1834071,
			first_name: 'Dmitriy Akulov',
			last_name: 'jimaek',
			github_username: null,
			github_organizations: null,
		};

		await callbacks.filter['users.create'](payload);

		expect(payload).to.deep.equal({
			provider: 'github',
			external_identifier: 1834071,
			first_name: 'Dmitriy',
			last_name: 'Akulov',
			github_username: 'jimaek',
			github_organizations: null,
		});
	});

	it('filter should use gh login as first_name if name is not provided', async () => {
		nock('https://api.github.com')
			.get(`/user/1834071/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		hook(hooks, context);

		const payload = {
			provider: 'github',
			external_identifier: 1834071,
			first_name: null,
			last_name: 'jimaek',
			github_username: null,
			github_organizations: null,
		};

		await callbacks.filter['users.create'](payload);

		expect(payload).to.deep.equal({
			provider: 'github',
			external_identifier: 1834071,
			first_name: 'jimaek',
			last_name: undefined,
			github_username: 'jimaek',
			github_organizations: null,
		});
	});

	it('filter should fulfill organizations, credits', async () => {
		nock('https://api.github.com')
			.get(`/user/1834071/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		creditsAdditionsService.readByQuery.resolves([{
			amount: 10,
			github_id: 1834071,
		}, {
			amount: 20,
			github_id: 1834071,
		}]);

		hook(hooks, context);

		await callbacks.action['users.create']({ key: '1-1-1-1', payload: {
			provider: 'github',
			external_identifier: 1834071,
			first_name: 'Dmitriy Akulov',
			last_name: 'jimaek',
			github_username: null,
			github_organizations: null,
		} });

		expect(usersService.updateOne.args[0]).to.deep.equal([ '1-1-1-1', { github_organizations: [ 'jsdelivr' ] }]);

		expect(creditsAdditionsService.updateByQuery.callCount).to.equal(1);

		expect(creditsAdditionsService.updateByQuery.args[0]).to.deep.equal([
			{ filter: { github_id: 1834071, consumed: false } },
			{ consumed: true },
		]);

		expect(creditsService.createOne.args[0]).to.deep.equal([{ amount: 30, user_id: '1-1-1-1' }]);
	});

	it('filter should fulfill user type', async () => {
		nock('https://api.github.com')
			.get(`/user/1834071/orgs`)
			.reply(200, [{ login: 'jsdelivr' }]);

		sponsorsService.readByQuery.resolves([{
			github_id: 1834071,
		}]);

		hook(hooks, context);

		await callbacks.action['users.create']({ key: '1-1-1-1', payload: {
			provider: 'github',
			external_identifier: 1834071,
			first_name: 'Dmitriy Akulov',
			last_name: 'jimaek',
			github_username: null,
			github_organizations: null,
		} });

		expect(usersService.updateOne.args[0]).to.deep.equal([ '1-1-1-1', { user_type: 'sponsor' }]);
	});
});
