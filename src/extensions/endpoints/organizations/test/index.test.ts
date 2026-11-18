import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

const ORG_ID = '1b3f6f1e-2a4c-4d5e-8f90-0a1b2c3d4e5f';
const BANNERS_FOLDER_ID = '5f0b6a52-3c1e-4b8e-9d6a-1c2f7e4a9b30';

// Only the file signature is read by the endpoint, the size comes from what Directus stored.
const SIGNATURES = {
	png: Buffer.from([ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ]),
	jpeg: Buffer.from([ 0xff, 0xd8, 0xff, 0xe0 ]),
	webp: Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'latin1'),
	gif: Buffer.from('GIF89a', 'latin1'),
};

const image = (format: keyof typeof SIGNATURES = 'png') => Buffer.concat([ SIGNATURES[format], Buffer.alloc(100) ]);

describe('/organizations endpoint', () => {
	const results: Record<string, unknown> = {};
	const calls: { table: string; method: string; args: unknown[] }[] = [];

	const builder = (table: string) => {
		const chain: Record<string, unknown> = {};

		[ 'where', 'whereIn', 'whereNotNull', 'orWhere', 'select', 'orderBy', 'forUpdate', 'first', 'update' ].forEach((method) => {
			chain[method] = (...args: unknown[]) => {
				calls.push({ table, method, args });
				typeof args[0] === 'function' && (args[0] as (query: unknown) => void)(chain);
				return chain;
			};
		});

		chain.then = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(results[table]).then(resolve, reject);
		return chain;
	};

	const database = Object.assign((table: string) => builder(table), {
		transaction: (callback: (trx: unknown) => Promise<unknown>) => callback(database),
	});

	const uploadOne = sinon.stub();
	const deleteOne = sinon.stub();
	const FilesService = sinon.stub().returns({ uploadOne, deleteOne });
	const getAsset = sinon.stub();
	const AssetsService = sinon.stub().returns({ getAsset });
	const BANNER_PRESET = { key: 'banner', fit: 'cover', width: 1224, height: 200, quality: 80, format: 'webp' };
	const SettingsService = sinon.stub().returns({ readSingleton: async () => ({ storage_asset_presets: [{ key: 'other' }, BANNER_PRESET ] }) });

	const context = {
		logger: { error: console.error, warn: sinon.stub() },
		database,
		services: { FilesService, AssetsService, SettingsService },
		getSchema: async () => ({}),
		env: { ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION: 6000 },
	} as unknown as EndpointExtensionContext;

	let accountability: { user: string; admin: boolean } | { user: null; admin: false };

	const app = express();
	app.use(express.json());

	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, context);
	app.use(router);

	const callsOf = (table: string, method: string) => calls.filter(call => call.table === table && call.method === method).map(call => call.args);

	const upload = (body: Buffer, type = 'image/png') => request(app).post(`/${ORG_ID}/banner`).set('Content-Type', type).send(body);

	beforeEach(() => {
		sinon.resetHistory();
		uploadOne.reset();
		deleteOne.reset();
		calls.length = 0;
		Object.keys(results).forEach(key => delete results[key]);

		accountability = { user: 'user-id', admin: false };
		results.gp_org_members = [{ org: ORG_ID }];
		results.gp_orgs = { id: ORG_ID, name: 'acme', banner: null };
		results.directus_files = { width: 1224, height: 200 };
		uploadOne.resolves('new-banner-id');
		deleteOne.resolves();
		getAsset.reset();
		getAsset.resolves({});
	});

	describe('GET /', () => {
		it('should list the public orgs with a profile', async () => {
			const orgs = [{ name: 'acme', website: 'https://acme.com', description: null, bannerId: 'banner-id' }];
			results.gp_orgs = orgs;
			accountability = { user: null, admin: false };

			const res = await request(app).get('/');

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal(orgs);
			expect(callsOf('gp_orgs', 'where')[0]).to.deep.equal([{ public_probes: true }]);
			expect(callsOf('gp_orgs', 'whereNotNull')).to.deep.equal([ [ 'banner' ] ]);
			expect(callsOf('gp_orgs', 'orWhere')).to.deep.equal([ [ 'website', '<>', '' ], [ 'description', '<>', '' ] ]);
			expect(callsOf('gp_orgs', 'select')).to.deep.equal([ [ 'name', 'website', 'description', 'banner as bannerId' ] ]);
		});
	});

	describe('GET /:name', () => {
		it('should return one public org matched case-insensitively', async () => {
			const org = { name: 'acme', website: null, description: 'Probes', bannerId: null };
			results.gp_orgs = org;

			const res = await request(app).get('/ACME');

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal(org);
			expect(callsOf('gp_orgs', 'where')).to.deep.include([{ name: 'ACME' }]);
		});

		it('should return 404 for an org that is missing or not public', async () => {
			results.gp_orgs = undefined;

			const res = await request(app).get('/acme');

			expect(res.status).to.equal(404);
			expect(res.text).to.equal('Organization not found.');
		});
	});

	describe('POST /:id/banner', () => {
		it('should store the image as sent in the banners folder, typed by its bytes, and point the org to it', async () => {
			const source = image('jpeg');
			const res = await upload(source, 'image/png');

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal({ bannerId: 'new-banner-id' });

			const [ stream, data ] = uploadOne.args[0]!;
			const chunks: Buffer[] = [];

			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			expect(Buffer.concat(chunks)).to.deep.equal(source);
			expect(data).to.deep.equal({ folder: BANNERS_FOLDER_ID, filename_download: 'banner.jpeg', type: 'image/jpeg' });
			expect(getAsset.args).to.deep.equal([ [ 'new-banner-id', { transformationParams: BANNER_PRESET }, undefined, true ] ]);
			expect(callsOf('gp_orgs', 'update')).to.deep.equal([ [{ banner: 'new-banner-id' }] ]);
			expect(deleteOne.callCount).to.equal(0);
		});

		it('should delete the previous banner after the org points to the new one', async () => {
			results.gp_orgs = { id: ORG_ID, name: 'acme', banner: 'old-banner-id' };

			deleteOne.callsFake(() => {
				expect(callsOf('gp_orgs', 'update')).to.have.length(1);
				return Promise.resolve();
			});

			const res = await upload(image());

			expect(res.status).to.equal(200);
			expect(deleteOne.args).to.deep.equal([ [ 'old-banner-id' ] ]);
		});

		it('should accept a WebP image', async () => {
			const res = await upload(image('webp'), 'image/gif');

			expect(res.status).to.equal(200);
			expect(uploadOne.args[0]![1]).to.include({ filename_download: 'banner.webp', type: 'image/webp' });
		});

		it('should allow a Directus admin who is not an org admin', async () => {
			accountability = { user: 'admin-id', admin: true };
			results.gp_org_members = [];

			const res = await upload(image());

			expect(res.status).to.equal(200);
		});

		it('should reject an anonymous request', async () => {
			accountability = { user: null, admin: false };

			const res = await upload(image());

			expect(res.status).to.equal(400);
			expect(uploadOne.callCount).to.equal(0);
		});

		it('should reject a user who is not an admin of the org', async () => {
			results.gp_org_members = [];

			const res = await upload(image());

			expect(res.status).to.equal(403);
			expect(res.text).to.equal('Only the admins of the organization can change its banner.');
			expect(uploadOne.callCount).to.equal(0);
		});

		it('should reject an id that is not a uuid', async () => {
			const res = await request(app).post('/acme/banner').set('Content-Type', 'image/png').send(image());

			expect(res.status).to.equal(400);
		});

		it('should reject bytes that are not an image', async () => {
			const res = await upload(Buffer.from('not an image'));

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The banner must be a PNG, JPEG or WebP image.');
		});

		it('should reject an image of another format', async () => {
			const res = await upload(image('gif'), 'image/png');

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The banner must be a PNG, JPEG or WebP image.');
			expect(uploadOne.callCount).to.equal(0);
		});

		it('should reject and delete an image Directus could not read the size of', async () => {
			results.directus_files = { width: null, height: null };

			const res = await upload(image('jpeg'));

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The banner must be a PNG, JPEG or WebP image.');
			expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
			expect(callsOf('gp_orgs', 'update')).to.have.length(0);
		});

		it('should reject and delete an image below the minimum size in either dimension', async () => {
			for (const [ width, height ] of [ [ 1223, 200 ], [ 1224, 199 ] ]) {
				deleteOne.resetHistory();
				results.directus_files = { width, height };

				const res = await upload(image());

				expect(res.status).to.equal(400);
				expect(res.text).to.equal('The banner must be at least 1224×200 px.');
				expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
			}
		});

		it('should reject and delete an image the banner preset cannot be rendered from', async () => {
			for (const [ width, height ] of [ [ 6001, 200 ], [ 1224, 6001 ] ]) {
				deleteOne.resetHistory();
				results.directus_files = { width, height };

				const res = await upload(image());

				expect(res.status).to.equal(400);
				expect(res.text).to.equal('The banner must be at most 6000×6000 px.');
				expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
			}
		});

		it('should reject and delete an image the banner preset fails to render from', async () => {
			getAsset.rejects(new Error('VipsJpeg: premature end of input file'));

			const res = await upload(image('jpeg'));

			expect((context.logger.warn as sinon.SinonStub).calledOnce).to.equal(true);

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The banner must be a PNG, JPEG or WebP image.');
			expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
			expect(callsOf('gp_orgs', 'update')).to.have.length(0);
		});

		it('should pass on a busy server error from rendering and delete the image', async () => {
			getAsset.rejects(new (createError('SERVICE_UNAVAILABLE', 'Server too busy', 503))());

			const res = await upload(image());

			expect(res.status).to.equal(503);
			expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
		});

		// supertest fails with EPIPE when the server answers before the whole body is sent, so these use a plain client.
		const postOversized = (type = 'image/png') => new Promise<{ status: number; text: string }>((resolve, reject) => {
			const server = app.listen(0, async () => {
				const { port } = server.address() as AddressInfo;
				const req = http.request({ port, method: 'POST', path: `/${ORG_ID}/banner`, headers: { 'Content-Type': type } });
				req.on('error', reject);

				const [ [ res ] ] = await Promise.all([
					once(req, 'response') as Promise<[ http.IncomingMessage ]>,
					new Promise<void>(resolve => req.end(Buffer.alloc(6 * 1024 * 1024), () => resolve())),
				]);

				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				await once(res, 'end');

				server.close();
				server.closeIdleConnections();
				resolve({ status: res.statusCode!, text: Buffer.concat(chunks).toString() });
			});
		});

		it('should reject a streamed body that grows past 5 MB', async () => {
			const res = await postOversized();

			expect(res).to.deep.equal({ status: 413, text: 'The banner must be 5 MB or smaller.' });
			expect(uploadOne.callCount).to.equal(0);
		});

		it('should reject a large body that is not an image and still answer', async () => {
			const res = await postOversized('text/plain');

			expect(res).to.deep.equal({ status: 400, text: 'The banner must be a PNG, JPEG or WebP image.' });
		});

		it('should return 404 for an org that does not exist and delete the uploaded file', async () => {
			accountability = { user: 'admin-id', admin: true };
			results.gp_orgs = undefined;

			const res = await upload(image());

			expect(res.status).to.equal(404);
			expect(callsOf('gp_orgs', 'update')).to.have.length(0);
			expect(deleteOne.args).to.deep.equal([ [ 'new-banner-id' ] ]);
		});

		it('should lock the org row while switching the banner', async () => {
			await upload(image());

			expect(calls.filter(call => call.table === 'gp_orgs').map(call => call.method)).to.deep.equal([ 'where', 'forUpdate', 'first', 'where', 'update' ]);
		});

		it('should reject a body that is not sent as an image', async () => {
			const res = await request(app).post(`/${ORG_ID}/banner`).send({ image: 'data' });

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('The banner must be a PNG, JPEG or WebP image.');
		});
	});

	describe('DELETE /:id/banner', () => {
		it('should unset the banner and delete its file', async () => {
			results.gp_orgs = { id: ORG_ID, name: 'acme', banner: 'old-banner-id' };

			const res = await request(app).delete(`/${ORG_ID}/banner`);

			expect(res.status).to.equal(200);
			expect(callsOf('gp_orgs', 'update')).to.deep.equal([ [{ banner: null }] ]);
			expect(deleteOne.args).to.deep.equal([ [ 'old-banner-id' ] ]);
		});

		it('should succeed when there is no banner', async () => {
			const res = await request(app).delete(`/${ORG_ID}/banner`);

			expect(res.status).to.equal(200);
			expect(deleteOne.callCount).to.equal(0);
		});

		it('should reject a user who is not an admin of the org', async () => {
			results.gp_org_members = [];

			const res = await request(app).delete(`/${ORG_ID}/banner`);

			expect(res.status).to.equal(403);
			expect(callsOf('gp_orgs', 'update')).to.have.length(0);
		});
	});
});
