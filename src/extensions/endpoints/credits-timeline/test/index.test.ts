import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { Router } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import endpoint from '../src/index.js';

describe('/credits-timeline endpoint', () => {
	const firstStub = sinon.stub();
	const offsetStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'first') {
				return firstStub;
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
	} as unknown as Router;

	beforeEach(() => {
		sinon.reset();
		resStatus.returns({ send: resSend });
		firstStub.resolves({ count: 0 });
		offsetStub.resolves([]);
	});

	endpoint(router, endpointContext);

	it('should accept user request', async () => {
		firstStub.resolves({ count: 1 });

		offsetStub.resolves([{
			id: '1',
			type: 'addition',
			date_created: '2025-04-10 02:00:00',
			amount: 2000,
			reason: 'one_time_sponsorship',
			meta: JSON.stringify({ amountInDollars: 1 }),
			adopted_probe: null,
		}]);

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
				changes: [
					{
						id: '1',
						type: 'addition',
						date_created: '2025-04-10 02:00:00',
						amount: 2000,
						reason: 'one_time_sponsorship',
						meta: { amountInDollars: 1 },
						adopted_probe: null,
					},
				],
				count: 1,
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

		expect(resSend.args[0]).to.deep.equal([{ changes: [], count: 0 }]);
	});

	it('should accept admin request for all users', async () => {
		const req = {
			accountability: {
				user: 'admin-id',
				admin: true,
			},
			query: {
				userId: null,
			},
		};

		await request('/', req, res);

		expect(resSend.args[0]).to.deep.equal([{ changes: [], count: 0 }]);
	});

	it('should reject user request for all users', async () => {
		const req = {
			accountability: {
				user: 'admin-id',
				admin: false,
			},
			query: {
				userId: null,
			},
		};

		await request('/', req, res);

		expect(resSend.args[0]).to.deep.equal([ '"query.userId" must be a string' ]);
	});
});
