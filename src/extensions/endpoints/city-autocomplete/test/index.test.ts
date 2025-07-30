import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import type { Router } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import { downloadCitiesFile } from '../src/actions/download-cities.js';
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

		await downloadCitiesFile();

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
					query: 'da',
					countries: 'US',
					limit: 5,
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);

			expect(resSend.args[0]?.[0]).to.deep.equal([
				{ name: 'Dallas', country: 'US' },
			]);
		});

		it('should return cities without countries parameter', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'DA',
					limit: 5,
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);

			expect(resSend.args[0]?.[0]).to.deep.equal([
				{ name: 'Dallas', country: 'US' },
				{ name: 'Amsterdam', country: 'NL' },
				{ name: 'Rotterdam', country: 'NL' },
			]);
		});

		it('should respect limit parameter', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'da',
					limit: 2,
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);
			const results = resSend.args[0]?.[0];
			expect(Array.isArray(results)).to.equal(true);
			expect(results.length).to.equal(2);
		});

		it('should reject request without accountability', async () => {
			const req = {
				query: {
					query: 'da',
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
					countries: 'FR',
					limit: 5,
				},
			};

			await request('/', req, res);

			expect(resStatus.callCount).to.equal(1);
			expect(resStatus.args[0]).to.deep.equal([ 400 ]);
			expect(resSend.callCount).to.equal(1);
		});

		it('should use default limit when not provided', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'a',
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);

			expect(resSend.args[0]?.[0]).to.deep.equal([
				{ name: 'Bangkok', country: 'TH' },
				{ name: 'Paris', country: 'FR' },
				{ name: 'Warsaw', country: 'PL' },
				{ name: 'Milan', country: 'IT' },
				{ name: 'Dallas', country: 'US' },
			]);
		});

		it('should handle empty countries parameter', async () => {
			const req = {
				accountability: {
					user: 'user-id',
					admin: false,
				},
				query: {
					query: 'Zwic',
					countries: '',
				},
			};

			await request('/', req, res);

			expect(resSend.callCount).to.equal(1);

			expect(resSend.args[0]?.[0]).to.deep.equal([{ name: 'Zwickau', country: 'DE' }]);
		});
	});
});
