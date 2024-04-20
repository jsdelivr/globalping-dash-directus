/* eslint-disable @typescript-eslint/no-explicit-any */
import nock from 'nock';
import { expect } from 'chai';
import hook from '../src/index.js';
import { isDirectusError } from '@directus/errors';

describe('gp_location_overrides hook', () => {
	const callbacks = {
		filter: {},
	};
	const hooks = {
		filter: (name, cb) => {
			callbacks.filter[name] = cb;
		},
	} as any;
	const context = {
		env: {
			GEONAMES_USERNAME: 'username',
		},
	} as any;

	before(() => {
		nock.disableNetConnect();
	});

	after(() => {
		nock.cleanAll();
	});

	const geonamesResponse = {
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
	};

	it('should fulfill values for city, country, state, lat and long for the saved item (create)', async () => {
		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&q=marsel')
			.reply(200, geonamesResponse);

		hook(hooks, context);
		const payload = { ip_range: '1.1.1.1/32', city: 'marsel' };
		await callbacks.filter['gp_location_overrides.items.create'](payload, { keys: [ '1' ] }, context);

		expect(payload).to.deep.equal({
			ip_range: '1.1.1.1/32',
			city: 'Marseille',
			state: null,
			country: 'FR',
			latitude: '43.29695',
			longitude: '5.38107',
		});
	});

	it('should fulfill values for city, country, state, lat and long for the saved item (update)', async () => {
		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&q=marsel')
			.reply(200, geonamesResponse);

		hook(hooks, context);
		const payload = { ip_range: '1.1.1.1/32', city: 'marsel' };
		await callbacks.filter['gp_location_overrides.items.update'](payload, { keys: [ '1' ] }, context);

		expect(payload).to.deep.equal({
			ip_range: '1.1.1.1/32',
			city: 'Marseille',
			state: null,
			country: 'FR',
			latitude: '43.29695',
			longitude: '5.38107',
		});
	});

	it('should throw if city wasn\'t speified in the payload', async () => {
		hook(hooks, context);
		const payload = { ip_range: '1.1.1.1/32', country: 'IT' };
		const err = await callbacks.filter['gp_location_overrides.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);
		expect(err.message).to.equal(`"city" value should be specified in payload.`);
	});

	it('should throw if no cities was found', async () => {
		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&q=marsel')
			.reply(200, {
				totalResultsCount: 0,
				geonames: [],
			});

		hook(hooks, context);
		const payload = { ip_range: '1.1.1.1/32', city: 'marsel' };
		const err = await callbacks.filter['gp_location_overrides.items.update'](payload, { keys: [ '1' ] }, context).catch(err => err);
		expect(isDirectusError(err)).to.equal(true);
	});

	it('should throw if invalid CIDR was provided', async () => {
		nock('http://api.geonames.org').get('/searchJSON?featureClass=P&style=medium&isNameRequired=true&maxRows=1&username=username&q=marsel')
			.reply(200, geonamesResponse);

		hook(hooks, context);
		const payload = { ip_range: '1.1.1.300/32', city: 'marsel' };
		const err = await callbacks.filter['gp_location_overrides.items.create'](payload, { keys: [ '1' ] }, context).catch(err => err);

		expect(err.message).to.equal(`ipaddr: the address has neither IPv6 nor IPv4 CIDR format`);
	});
});
