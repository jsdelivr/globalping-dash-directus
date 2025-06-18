import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { Router } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
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
	const resSend = sinon.stub();
	const resStatus = sinon.stub();
	const res = { status: resStatus, send: resSend };

	const routes: Record<string, (request: object, response: typeof res) => void> = {};
	const request = (route: string, request: object, response: typeof res) => {
		const handler = routes[route];

		if (!handler) {
			throw new Error('Handler for the route is not defined');
		}

		return handler(request, response);
	};
	const router = {
		get: (route: string, handler: (request: object, response: typeof res) => void) => {
			routes[route] = handler;
		},
		post: (route: string, handler: (request: object, response: typeof res) => void) => {
			routes[route] = handler;
		},
	} as unknown as Router;

	beforeEach(() => {
		sinon.reset();
		resStatus.returns({ send: resSend });
		countStub.resolves([{ total: 0 }]);
		offsetStub.resolves([]);
	});

	// @ts-expect-error Looks like @directus/extensions-sdk v12 adds wrong type.
	endpoint(router, endpointContext);

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

		const req = {
			accountability: {
				user: 'user-id',
				admin: false,
			},
			query: {
				userId: 'user-id',
			},
		};

		await request('/', req, res);

		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]).to.deep.equal([
			{
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
			},
		]);
	});

	it('should reject user request for another user', async () => {
		const req = {
			accountability: {
				user: 'user-id',
				admin: false,
			},
			query: {
				userId: 'another-user-id',
			},
		};

		await request('/', req, res);

		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.args[0]).to.deep.equal([ 'Allowed only for the current user or admin.' ]);
	});

	it('should accept admin request for another user', async () => {
		const req = {
			accountability: {
				user: 'admin-id',
				admin: true,
			},
			query: {
				userId: 'another-user-id',
			},
		};

		await request('/', req, res);

		expect(resSend.args[0]).to.deep.equal([{ applications: [], total: 0 }]);
	});

	it('should accept admin request for all users', async () => {
		const req = {
			accountability: {
				user: 'admin-id',
				admin: true,
			},
			query: {
				userId: 'all',
			},
		};

		await request('/', req, res);

		expect(resSend.args[0]).to.deep.equal([{ applications: [], total: 0 }]);
	});

	it('should reject user request for all users', async () => {
		const req = {
			accountability: {
				user: 'admin-id',
				admin: false,
			},
			query: {
				userId: 'all',
			},
		};

		await request('/', req, res);

		expect(resSend.args[0]).to.deep.equal([ 'Allowed only for admin.' ]);
	});
});
