/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';
import { CountryNotDefinedError, DifferentCountriesError, InvalidCityError, InvalidTagError, ProbesNotFoundError, TooBigTagError, TooManyTagsError } from '../src/validate-fields.js';

describe('adopted-probe-city hook', () => {
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
	const updateMany = sinon.stub();
	const readMany = sinon.stub();
	const context = {
		accountability: {
			user: 'userId',
		},
		env: {
			GEONAMES_USERNAME: 'username',
		},
		database: {},
		getSchema: () => Promise.resolve({}),
		services: {
			ItemsService: sinon.stub().callsFake(() => {
				return { updateMany, readMany };
			}),
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

	it('should update city, lat and long of the adopted probe', async () => {
		readMany.resolves([{
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
		await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(readMany.callCount).to.equal(1);
		expect(readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(payload.city).to.equal('Marseille');

		await callbacks.action['adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(updateMany.callCount).to.equal(1);

		expect(updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: '43.29695', longitude: '5.38107', isCustomCity: true, countryOfCustomCity: 'FR', state: null },
			{ emitEvents: false },
		]);
	});

	it('should additionally update state for the US cities', async () => {
		readMany.resolves([{
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
		await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(readMany.callCount).to.equal(1);
		expect(readMany.args[0]).to.deep.equal([ [ '1' ] ]);
		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(payload.city).to.equal('Miami');

		await callbacks.action['adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(updateMany.callCount).to.equal(1);

		expect(updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: '25.77427', longitude: '-80.19366', isCustomCity: true, countryOfCustomCity: 'US', state: 'FL' },
			{ emitEvents: false },
		]);
	});

	it('should reset city, lat and long of the adopted probe', async () => {
		readMany.resolves([{
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: true,
		}]);

		hook(hooks, context);
		const payload = { city: null };

		await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);
		await callbacks.action['adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(updateMany.callCount).to.equal(1);

		expect(updateMany.args[0]).to.deep.equal([
			[ '1' ],
			{ latitude: null, longitude: null, isCustomCity: false, countryOfCustomCity: null, state: null },
			{ emitEvents: false },
		]);

		expect(payload.city).to.equal(null);
	});

	it('should update non-city meta fields of the adopted probe', async () => {
		readMany.resolves([{
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: 'FR',
			isCustomCity: false,
		}]);

		hook(hooks, context);
		const payload = { name: 'My Probe', tags: [ 'mytag', 'mytag2' ] };
		await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context);

		expect(readMany.callCount).to.equal(0);
		expect(nock.isDone()).to.equal(true);
		expect(updateMany.callCount).to.equal(0);
		expect(payload).to.deep.equal({ name: 'My Probe', tags: [ 'mytag', 'mytag2' ] });

		await callbacks.action['adopted_probes.items.update']({ payload, keys: [ '1' ] }, context);

		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if probes not found', async () => {
		readMany.resolves([]);

		hook(hooks, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err).to.deep.equal(new ProbesNotFoundError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if country is not defined', async () => {
		readMany.resolves([{
			city: 'Paris',
			state: null,
			latitude: '48.85341',
			longitude: '2.3488',
			country: null,
			isCustomCity: false,
		}]);

		hook(hooks, context);
		const payload = { city: 'marsel' };
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err).to.deep.equal(new CountryNotDefinedError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if target probes are in different countries', async () => {
		readMany.resolves([{
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
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err).to.deep.equal(new DifferentCountriesError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if provided city is not valid', async () => {
		readMany.resolves([{
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
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(nock.isDone()).to.equal(true);
		expect(err).to.deep.equal(new InvalidCityError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if there are too many tags', async () => {
		hook(hooks, context);
		const payload = { tags: [ 'a', 'b', 'c', 'd', 'e', 'f' ] };
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(nock.isDone()).to.equal(true);
		expect(err).to.deep.equal(new TooManyTagsError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if the tag is too big', async () => {
		hook(hooks, context);
		const payload = { tags: [ 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' ] };
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(nock.isDone()).to.equal(true);
		expect(err).to.deep.equal(new TooBigTagError());
		expect(updateMany.callCount).to.equal(0);
	});

	it('should send valid error if the tag has invalid character', async () => {
		hook(hooks, context);
		const payload = { tags: [ '@mytag' ] };
		const err = await callbacks.filter['adopted_probes.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(nock.isDone()).to.equal(true);
		expect(err).to.deep.equal(new InvalidTagError());
		expect(updateMany.callCount).to.equal(0);
	});
});
