import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EndpointExtensionContext } from '@directus/extensions';
import AdmZip from 'adm-zip';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import nock from 'nock';
import * as sinon from 'sinon';
import request from 'supertest';
import { downloadCities, FILENAME, getCitiesJson } from '../src/download-cities.js';
import endpoint from '../src/index.js';

const citiesZip = new AdmZip();
citiesZip.addLocalFile(fileURLToPath(new URL('./cities500.txt', import.meta.url)));

describe('city-autocomplete endpoint', () => {
	const endpointContext = {
		logger: {
			error: console.error,
			info: console.log,
		},
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());
	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	let readFile: sinon.SinonStub;

	before(async () => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
		nock('https://download.geonames.org').get('/export/dump/cities500.zip').reply(200, citiesZip.toBuffer());

		const citiesJson = await downloadCities().then(getCitiesJson);
		const dataPath = fileURLToPath(new URL(`../data/${FILENAME}`, import.meta.url));
		readFile = sinon.stub(fs.promises, 'readFile').callThrough();
		readFile.withArgs(dataPath, 'utf-8').resolves(citiesJson);
		(endpoint as any)(router, endpointContext);
		app.use(router);
	});

	beforeEach(() => {
		sinon.resetHistory();

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	afterEach(() => {
		nock.cleanAll();
	});

	after(() => {
		readFile?.restore();
		nock.cleanAll();
	});

	it('should download the archive without an ETag precondition', async () => {
		const archive = nock('https://download.geonames.org', { badheaders: [ 'if-match' ] })
			.get('/export/dump/cities500.zip')
			.reply(200, citiesZip.toBuffer(), { ETag: '"cities-v2"' });

		expect(await downloadCities()).to.have.length.greaterThan(0);
		archive.done();
	});

	describe('/city-autocomplete', () => {
		it('should return cities filtered by countries', async () => {
			const res = await request(app).get('/').query({
				query: 'new',
				countries: 'US',
				limit: 5,
			});

			expect(res.status).to.equal(200);

			expect(res.body).to.deep.equal([
				{
					name: 'New York',
					country: 'US',
					state: 'NY',
					stateName: 'New York',
				},
			]);
		});

		it('should convert non-ascii characters to ascii', async () => {
			const res = await request(app).get('/').query({
				query: 'Pécs',
				countries: 'HU',
				limit: 5,
			});

			expect(res.status).to.equal(200);

			expect(res.body).to.deep.equal([
				{
					name: 'Pecs',
					country: 'HU',
					state: null,
					stateName: null,
				},
			]);
		});

		it('should work with input in Chinese', async () => {
			const res = await request(app).get('/').query({
				query: '北京市',
				countries: 'CN',
				limit: 5,
			});

			expect(res.status).to.equal(200);

			expect(res.body).to.deep.equal([
				{
					name: 'Beijing',
					country: 'CN',
					state: null,
					stateName: null,
				},
			]);
		});

		it('should respect limit parameter', async () => {
			const res = await request(app).get('/').query({
				query: 'B',
				countries: 'AR,TH,BE',
				limit: 2,
			});

			expect(res.status).to.equal(200);
			const results = res.body;
			expect(Array.isArray(results)).to.equal(true);

			expect(results).to.deep.equal([
				{ name: 'Buenos Aires', country: 'AR', state: null, stateName: null },
				{ name: 'Bangkok', country: 'TH', state: null, stateName: null },
			]);
		});

		it('should reject request without accountability', async () => {
			accountability = {};

			const res = await request(app).get('/').query({
				query: 'b',
				countries: 'AR,TH,BE',
				limit: 2,
			});

			expect(res.status).to.equal(400);
		});

		it('should reject request without query parameter', async () => {
			const res = await request(app).get('/').query({
				countries: 'AR,TH,BE',
				limit: 5,
			});

			expect(res.status).to.equal(400);
		});
	});
});
