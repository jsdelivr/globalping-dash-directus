import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/applications endpoint', () => {
	const countStub = sinon.stub();
	const offsetStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'count') {
				return countStub;
			} else if (property === 'offset') {
				return offsetStub;
			}

			return database;
		},
	}) as unknown as Knex;

	const endpointContext = {
		logger: {
			error: console.error,
		},
		database,
	} as unknown as EndpointExtensionContext;

	const app = express();
	app.use(express.json());
	let accountability: { user: string; admin: boolean } | Record<string, never> = {};
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	// @ts-expect-error Looks like @directus/extensions-sdk v12 adds wrong type.
	endpoint(router, endpointContext);
	app.use(router);

	beforeEach(() => {
		sinon.resetHistory();
		countStub.resolves([{ total: 0 }]);
		offsetStub.resolves([]);

		accountability = {
			user: 'user-id',
			admin: false,
		};
	});

	it('should accept user request', async () => {
		offsetStub.resolves([{
			id: '1',
			app_id: 'app-1',
			date_last_used: '2025-04-10 02:00:00',
			user_created: 'user-1',
			app_name: 'Client Credentials App',
			owner_name: null,
			owner_url: null,
		}]);

		countStub.resolves([{ total: 1 }]);

		const res = await request(app).get('/').query({
			userId: 'user-id',
		});

		expect(res.status).to.equal(200);

		expect(res.body).to.deep.equal({
			applications: [
				{
					id: 'app-1',
					name: 'Client Credentials App',
					date_last_used: '2025-04-10 02:00:00',
					owner_name: 'Globalping',
					owner_url: 'https://globalping.io/',
					user_id: 'user-1',
				},
			],
			total: 1,
		});
	});

	it('should reject user request for another user', async () => {
		const res = await request(app).get('/').query({
			userId: 'another-user-id',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Allowed only for the current user or admin.');
	});

	it('should accept admin request for another user', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			userId: 'another-user-id',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ applications: [], total: 0 });
	});

	it('should accept admin request for all users', async () => {
		accountability = {
			user: 'admin-id',
			admin: true,
		};

		const res = await request(app).get('/').query({
			userId: 'all',
		});

		expect(res.status).to.equal(200);
		expect(res.body).to.deep.equal({ applications: [], total: 0 });
	});

	it('should reject user request for all users', async () => {
		const res = await request(app).get('/').query({
			userId: 'all',
		});

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Allowed only for admin.');
	});
});
