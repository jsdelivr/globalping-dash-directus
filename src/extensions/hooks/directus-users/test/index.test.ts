import { expect } from 'chai';
import * as sinon from 'sinon';
import defineHook from '../src/index.js';
import { HookExtensionContext } from '@directus/extensions';

describe('token hooks', () => {
	const callbacks = {
		filter: {},
		action: {},
	};
	const events = {
		filter: (name, cb) => {
			callbacks.filter[name] = cb;
		},
		action: (name, cb) => {
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

	it('should additionally delete user credits additions', async () => {
		usersService.readByQuery.resolves([{ id: '1-1-1-1-1', external_identifier: '123' }]);

		await callbacks.filter['users.delete']([ '1-1-1-1-1' ], {}, { accountability: {} });

		expect(creditsAdditionsService.deleteByQuery.args[0]).to.deep.equal([{ filter: { github_id: { _in: [ '123' ] } } }]);
	});

	it('should do nothing if read query returned nothing', async () => {
		usersService.readByQuery.resolves([]);

		await callbacks.filter['users.delete']([ '1-1-1-1-1' ], {}, { accountability: {} });

		expect(creditsAdditionsService.deleteByQuery.callCount).to.deep.equal(0);
	});

	it('should throw if accountability was not provided', async () => {
		usersService.readByQuery.resolves([{ id: '1-1-1-1-1', external_identifier: '123' }]);

		const err = await callbacks.filter['users.delete']([ '1-1-1-1-1' ], {}, { accountability: null }).catch(err => err);

		expect(err.message).to.equal('User is not authenticated');
	});
});
