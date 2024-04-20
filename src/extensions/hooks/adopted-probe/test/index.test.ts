/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';
import { payloadError } from '../src/validate-fields.js';

describe('adopted-probe hook', () => {
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
	const users = {
		readOne: sinon.stub(),
	};
	const adoptedProbes = {
		updateMany: sinon.stub(),
		readMany: sinon.stub(),
	};
	const context = {
		accountability: {
			user: '1',
		},
		env: {
			GEONAMES_USERNAME: 'username',
		},
		database: {},
		getSchema: () => Promise.resolve({}),
		services: {
			ItemsService: sinon.stub().callsFake((collection) => {
				if (collection === 'directus_users') {
					return users;
				} else if (collection === 'gp_adopted_probes') {
					return adoptedProbes;
				}

				throw new Error('stubs for collection are not defined');
			}),
		},
	} as any;

	before(() => {
		nock.disableNetConnect();
	});

	beforeEach(() => {
		sinon.resetHistory();

		users.readOne.resolves({
			github_username: 'jimaek',
			github_organizations: [ 'jsdelivr' ],
		});
	});

	after(() => {
		nock.cleanAll();
	});

	it('should update city, lat and long of the adopted probe', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: false,
		}]);

		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&country=FR&q=marsel')
			.reply(200, {
				totalResultsCount: 5,
				geonames: [
					{
						adminCode1: '93',
						lng: '5.38107',
						geonameId: 2995469,
						toponymName: 'Marseille',
						countryId: '3017382',
						fcl: 'P',
						population: 870731,
						countryCode: 'FR',
						name: 'Marseille',
						fclName: 'city, village,...',
						adminCodes1: {
							ISO3166_2: 'PAC',
						},
						countryName: 'France',
						fcodeName: 'seat of a first-order administrative division',
						adminName1: 'Provence-Alpes-Côte d\'Azur',
						lat: '43.29695',
						fcode: 'PPLA',
					},
				],
			});

		hook(hooks, context);
		const payload = { city: 'marsel' };
		await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(adoptedProbes.readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(payload.city).to.equal('Marseille');

		await callbacks.action['gp_adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: '43.29695', longitude: '5.38107', isCustomCity: true, countryOfCustomCity: 'FR', state: null },
			{ emitEvents: false },
		]);
	});

	it('should additionally update state for the US cities', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Detroit',
			state: 'MI',
			latitude: '42.33143',
			longitude: '-83.04575',
			country: 'US',
			isCustomCity: false,
		}]);

		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&country=US&q=miami')
			.reply(200, {
				totalResultsCount: 54,
				geonames: [
					{
						adminCode1: 'FL',
						lng: '-80.19366',
						geonameId: 4164138,
						toponymName: 'Miami',
						countryId: '6252001',
						fcl: 'P',
						population: 441003,
						countryCode: 'US',
						name: 'Miami',
						fclName: 'city, village,...',
						adminCodes1: {
							ISO3166_2: 'FL',
						},
						countryName: 'United States',
						fcodeName: 'seat of a second-order administrative division',
						adminName1: 'Florida',
						lat: '25.77427',
						fcode: 'PPLA2',
					},
				],
			});

		hook(hooks, context);
		const payload = { city: 'miami' };
		await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(adoptedProbes.readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(payload.city).to.equal('Miami');

		await callbacks.action['gp_adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: '25.77427', longitude: '-80.19366', isCustomCity: true, countryOfCustomCity: 'US', state: 'FL' },
			{ emitEvents: false },
		]);
	});

	it('should reset city, lat and long of the adopted probe', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: true,
		}]);

		hook(hooks, context);
		const payload = { city: null };

		await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);
		await callbacks.action['gp_adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: null, longitude: null, isCustomCity: false, countryOfCustomCity: null, state: null },
			{ emitEvents: false },
		]);

		expect(payload.city).to.equal(null);
	});

	it('should update non-city meta fields of the adopted probe', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: false,
		}]);

		hook(hooks, context);
		const payload = { name: 'My Probe', tags: [{ prefix: 'jimaek', value: 'mytag' }, { prefix: 'jsdelivr', value: 'mytag2' }] };
		await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(nock.isDone()).to.equal(true);

		expect(payload).to.deep.equal({
			name: 'My Probe',
			tags: [
				{ prefix: 'jimaek', value: 'mytag' },
				{ prefix: 'jsdelivr', value: 'mytag2' },
			],
		});

		await callbacks.action['gp_adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(0);
	});

	it('should send valid error if probes not found', async () => {
		adoptedProbes.readMany.resolves([]);

		hook(hooks, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err).to.deep.equal(payloadError('Adopted probes not found.'));
	});

	it('should send valid error if country is not defined', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: null,
			isCustomCity: false,
		}]);

		hook(hooks, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err.status).to.equal(400);
		expect(adoptedProbes.updateMany.callCount).to.equal(0);
	});

	it('should send valid error if target probes are in different countries', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: false,
		}, {
			city: 'London',
			latitude: '51.50853',
			longitude: '-0.12574',
			country: 'GB',
			isCustomCity: false,
		}]);

		hook(hooks, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err.status).to.equal(400);
	});

	it('should send valid error if provided city is not valid', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: false,
		}]);

		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&country=FR&q=invalidcity')
			.reply(200, {
				totalResultsCount: 0,
				geonames: [],
			});

		hook(hooks, context);
		const payload = { city: 'invalidcity' };
		const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(nock.isDone()).to.equal(true);
		expect(err.status).to.equal(400);
		expect(adoptedProbes.updateMany.callCount).to.equal(0);
	});

	describe('tags validation', () => {
		before(() => {
			adoptedProbes.readMany.resolves([{
				userId: '1',
				city: 'Paris',
				state: null,
				latitude: '48.85341',
				longitude: '2.3488',
				country: 'FR',
				isCustomCity: false,
			}]);
		});

		it('should send valid error if prefix is wrong', async () => {
			hook(hooks, context);
			const payload = { tags: [{ prefix: 'wrong_organization', value: 'a' }] };
			const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].prefix" must be one of [jimaek, jsdelivr]');
		});

		it('should allow saving of prev values with outdated prefix', async () => {
			hook(hooks, context);

			adoptedProbes.readMany.resolves([{
				userId: '1',
				tags: [{ prefix: 'oldprefix', value: 'a' }],
				city: 'Paris',
				state: null,
				latitude: '48.85341',
				longitude: '2.3488',
				country: 'FR',
				isCustomCity: false,
			}]);

			const payload = { tags: [{ prefix: 'oldprefix', value: 'a' }] };

			await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);


			expect(payload).to.deep.equal({ tags: [{ prefix: 'oldprefix', value: 'a' }] });
		});

		it('should not allow new values with outdated prefix', async () => {
			hook(hooks, context);

			adoptedProbes.readMany.resolves([{
				userId: '1',
				tags: [{ prefix: 'oldprefix', value: 'a' }],
				city: 'Paris',
				state: null,
				latitude: '48.85341',
				longitude: '2.3488',
				country: 'FR',
				isCustomCity: false,
			}]);

			const payload = { tags: [{ prefix: 'oldprefix', value: 'a' }, { prefix: 'oldprefix', value: 'b' }] };

			const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].prefix" must be one of [jimaek, jsdelivr]');
		});

		it('should send valid error if there are too many tags', async () => {
			hook(hooks, context);
			const payload = { tags: [
				{ prefix: 'jimaek', value: 'a' },
				{ prefix: 'jimaek', value: 'b' },
				{ prefix: 'jimaek', value: 'c' },
				{ prefix: 'jimaek', value: 'd' },
				{ prefix: 'jimaek', value: 'e' },
				{ prefix: 'jimaek', value: 'f' },
			] };
			const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"value" must contain less than or equal to 5 items');
		});

		it('should send valid error if the tag is too big', async () => {
			hook(hooks, context);
			const payload = { tags: [{ prefix: 'jimaek', value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
			const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].value" length must be less than or equal to 32 characters long');
			expect(adoptedProbes.updateMany.callCount).to.equal(0);
		});

		it('should send valid error if the tag has invalid characters', async () => {
			hook(hooks, context);
			const payload = { tags: [{ prefix: 'jimaek', value: '@mytag' }] };
			const err = await callbacks.filter['gp_adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].value" with value "@mytag" fails to match the required pattern: /^[a-zA-Z0-9-]+$/');
		});
	});
});
