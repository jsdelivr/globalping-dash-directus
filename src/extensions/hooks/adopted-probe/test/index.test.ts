import { expect } from 'chai';
import nock from 'nock';
import * as sinon from 'sinon';
import hook from '../src/index.js';
import { payloadError } from '../src/validate-fields.js';

type FilterCallback = (payload: any, meta: any, context: any) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('adopted-probe hook', () => {
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
	const users = {
		readOne: sinon.stub(),
	};
	const adoptedProbes = {
		updateMany: sinon.stub(),
		readMany: sinon.stub(),
		readOne: sinon.stub(),
		readByQuery: sinon.stub(),
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
				} else if (collection === 'gp_probes') {
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
			latitude: '48.85',
			longitude: '2.35',
			country: 'FR',
			customLocation: null,
			allowedCountries: [ 'FR' ],
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

		hook(events, context);
		const payload = { city: 'marsel' };
		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(adoptedProbes.readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(payload.city).to.equal('Marseille');

		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{
				state: null,
				stateName: null,
				latitude: 43.3,
				longitude: 5.38,
				countryName: 'France',
				continent: 'EU',
				continentName: 'Europe',
				region: 'Western Europe',
				customLocation: {
					country: 'FR',
					city: 'Marseille',
					latitude: 43.3,
					longitude: 5.38,
					state: null,
				},
			},
			{ emitEvents: false },
		]);
	});

	it('should additionally update state for the US cities', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Detroit',
			state: 'MI',
			latitude: '42.33',
			longitude: '-83.05',
			country: 'US',
			allowedCountries: [ 'US' ],
			customLocation: null,
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

		hook(events, context);
		const payload = { city: 'miami' };
		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(adoptedProbes.readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(payload.city).to.equal('Miami');

		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{
				state: 'FL',
				stateName: 'Florida',
				countryName: 'United States',
				continent: 'NA',
				continentName: 'North America',
				region: 'Northern America',
				latitude: 25.77,
				longitude: -80.19,
				customLocation: {
					country: 'US',
					city: 'Miami',
					latitude: 25.77,
					longitude: -80.19,
					state: 'FL',
				},
			},
			{ emitEvents: false },
		]);
	});

	it('should reset city, lat and long of the adopted probe', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: 48.85,
			longitude: 2.35,
			country: 'FR',
			allowedCountries: [ 'FR' ],
			customLocation: {
				city: 'Paris',
				state: null,
				latitude: 48.85,
				longitude: 2.35,
				country: 'FR',
			},
		}]);

		hook(events, context);
		const payload = { city: null };

		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);
		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(1);

		expect(adoptedProbes.updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{
				stateName: null,
				countryName: null,
				continent: null,
				continentName: null,
				region: null,
				country: null,
				city: null,
				latitude: null,
				longitude: null,
				state: null,
				customLocation: null,
			},
			{ emitEvents: false },
		]);

		expect(payload.city).to.equal(null);
	});

	it('should set default name if falsy name is provided', async () => {
		adoptedProbes.readOne.resolves({
			id: 'id-1',
			userId: 'user-id-value',
			country: 'FR',
			city: 'Paris',
		});

		adoptedProbes.readByQuery.resolves([{ id: 'id-1' }]);

		hook(events, context);
		const payload = { name: '' };

		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);
		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(payload.name).to.equal('probe-fr-paris-01');
	});

	it('should increment name index if there are other probes with the same values', async () => {
		adoptedProbes.readOne.resolves({
			id: 'id-1',
			userId: 'user-id-value',
			country: 'FR',
			city: 'Paris',
		});

		adoptedProbes.readByQuery.resolves([{ id: 'id-2' }]);

		hook(events, context);
		const payload = { name: null };

		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);
		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(payload.name).to.equal('probe-fr-paris-02');
	});

	it('should increment name index based on the existing names if there are other probes with the default names', async () => {
		adoptedProbes.readOne.resolves({
			id: 'id-1',
			userId: 'user-id-value',
			country: 'FR',
			city: 'Paris',
		});

		adoptedProbes.readByQuery.resolves([{ id: 'id-2', name: 'probe-fr-paris-100' }]);

		hook(events, context);
		const payload = { name: null };

		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);
		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(payload.name).to.equal('probe-fr-paris-101');
	});

	it('should update non-city meta fields of the adopted probe', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85',
			longitude: '2.35',
			country: 'FR',
			allowedCountries: [ 'FR' ],
			customLocation: null,
		}]);

		hook(events, context);
		const payload = { name: 'My Probe', tags: [{ prefix: 'jimaek', value: 'mytag' }, { prefix: 'jsdelivr', value: 'mytag2' }] };
		await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);

		expect(adoptedProbes.readMany.callCount).to.equal(1);
		expect(nock.isDone()).to.equal(true);

		expect(payload).to.deep.equal({
			name: 'My Probe',
			tags: [
				{ prefix: 'jimaek', value: 'mytag' },
				{ prefix: 'jsdelivr', value: 'mytag2' },
			],
		});

		await callbacks.action['gp_probes.items.update']?.({ payload, keys: [ '1' ] }, context);

		expect(adoptedProbes.updateMany.callCount).to.equal(0);
	});

	it('should send valid error if probes not found', async () => {
		adoptedProbes.readMany.resolves([]);

		hook(events, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err).to.deep.equal(payloadError('Adopted probe not found.'));
	});

	it('should send valid error if country is not defined', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85',
			longitude: '2.35',
			country: null,
			allowedCountries: [ 'FR' ],
			customLocation: null,
		}]);

		hook(events, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err.status).to.equal(400);
		expect(adoptedProbes.updateMany.callCount).to.equal(0);
	});

	it('should send valid error if provided city is not valid', async () => {
		adoptedProbes.readMany.resolves([{
			userId: '1',
			city: 'Paris',
			state: null,
			latitude: '48.85',
			longitude: '2.35',
			country: 'FR',
			allowedCountries: [ 'FR' ],
			customLocation: null,
		}]);

		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&country=FR&q=invalidcity')
			.reply(200, {
				totalResultsCount: 0,
				geonames: [],
			});

		hook(events, context);
		const payload = { city: 'invalidcity' };
		const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

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
				latitude: '48.85',
				longitude: '2.35',
				country: 'FR',
				allowedCountries: [ 'FR' ],
				customLocation: null,
			}]);
		});

		it('should send valid error if prefix is wrong', async () => {
			hook(events, context);
			const payload = { tags: [{ prefix: 'wrong_organization', value: 'a' }] };
			const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].prefix" must be one of [jimaek, jsdelivr]');
		});

		it('should allow saving of prev values with outdated prefix', async () => {
			hook(events, context);

			adoptedProbes.readMany.resolves([{
				userId: '1',
				tags: [{ prefix: 'oldprefix', value: 'a' }],
				city: 'Paris',
				state: null,
				latitude: '48.85',
				longitude: '2.35',
				country: 'FR',
				allowedCountries: [ 'FR' ],
				customLocation: null,
			}]);

			const payload = { tags: [{ prefix: 'oldprefix', value: 'a' }] };

			await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context);


			expect(payload).to.deep.equal({ tags: [{ prefix: 'oldprefix', value: 'a' }] });
		});

		it('should not allow new values with outdated prefix', async () => {
			hook(events, context);

			adoptedProbes.readMany.resolves([{
				userId: '1',
				tags: [{ prefix: 'oldprefix', value: 'a' }],
				city: 'Paris',
				state: null,
				latitude: '48.85',
				longitude: '2.35',
				country: 'FR',
				allowedCountries: [ 'FR' ],
				customLocation: null,
			}]);

			const payload = { tags: [{ prefix: 'oldprefix', value: 'a' }, { prefix: 'oldprefix', value: 'b' }] };

			const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].prefix" must be one of [jimaek, jsdelivr]');
		});

		it('should send valid error if there are too many tags', async () => {
			hook(events, context);
			const payload = {
				tags: [
					{ prefix: 'jimaek', value: 'a' },
					{ prefix: 'jimaek', value: 'b' },
					{ prefix: 'jimaek', value: 'c' },
					{ prefix: 'jimaek', value: 'd' },
					{ prefix: 'jimaek', value: 'e' },
					{ prefix: 'jimaek', value: 'f' },
				],
			};
			const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('A maximum of 5 tags is allowed.');
		});

		it('should send valid error if the tag is too big', async () => {
			hook(events, context);
			const payload = { tags: [{ prefix: 'jimaek', value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
			const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].value" length must be less than or equal to 32 characters long');
			expect(adoptedProbes.updateMany.callCount).to.equal(0);
		});

		it('should send valid error if the tag has invalid characters', async () => {
			hook(events, context);
			const payload = { tags: [{ prefix: 'jimaek', value: '@mytag' }] };
			const err = await callbacks.filter['gp_probes.items.update']?.(payload, { keys: [ '1' ] }, context).catch(err => err);

			expect(err.message).to.equal('"[0].value" with value "@mytag" fails to match the required pattern: /^[a-zA-Z0-9-]+$/');
		});
	});
});
