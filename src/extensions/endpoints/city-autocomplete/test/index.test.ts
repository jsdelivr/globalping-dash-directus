import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import type { Router } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import { downloadCities, generateCitiesJsonFile } from '../src/download-cities.js';
import endpoint from '../src/index.js';

describe('city-autocomplete endpoint', () => {
	const endpointContext = {
		logger: {
			error: console.error,
			info: console.log,
		},
	} as unknown as EndpointExtensionContext;
	const resSend = sinon.stub();
	const resStatus = sinon.stub().returns({ send: resSend });
	const res = { status: resStatus, send: resSend };

	const routes: Record<string, (request: object, response: typeof res) => Promise<void>> = {};
	const request = (route: string, request: object, response: typeof res) => {
		const handler = routes[route];

		if (!handler) {
			throw new Error('Handler for the route is not defined');
		}

		return handler(request, response);
	};
	const router = {
		get: (route: string, handler: (request: object, response: typeof res) => Promise<void>) => {
			routes[route] = handler;
		},
	} as unknown as Router;

	before(async () => {
		nock.disableNetConnect();
		const zip = new AdmZip();
		const __dirname = dirname(fileURLToPath(import.meta.url));
		zip.addLocalFile(path.join(__dirname, 'cities500.txt'));
		nock('https://download.geonames.org').get('/export/dump/cities500.zip').reply(200, zip.toBuffer());

		await downloadCities().then(generateCitiesJsonFile);

		(endpoint as any)(router, endpointContext);
	});

	beforeEach(() => {
		sinon.resetHistory();
	});

	after(() => {
		nock.cleanAll();
	});

	describe('/city-autocomplete', () => {
		it('should return cities filtered by countries', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'new',
					countries: 'US',
					limit: 5,
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);

			expect(resSend.args[0]?.[0]).to.deep.equal([
				{
					name: 'New York',
					country: 'US',
					state: 'NY',
					stateName: 'New York',
				},
			]);
		});

		it('should respect limit parameter', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'B',
					countries: 'AR,TH,BE',
					limit: 2,
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);
			const results = resSend.args[0]?.[0];
			expect(Array.isArray(results)).to.equal(true);

			expect(results).to.deep.equal([
				{ name: 'Buenos Aires', country: 'AR', state: null, stateName: null },
				{ name: 'Bangkok', country: 'TH', state: null, stateName: null },
			]);
		});

		it('should reject request without accountability', async () => {
			const req = {
				query: {
					query: 'b',
					countries: 'AR,TH,BE',
					limit: 2,
				},
			};

			await request('/', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
		});

		it('should reject request without query parameter', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					countries: 'AR,TH,BE',
					limit: 5,
				},
			};

			await request('/', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
		});
	});
});
