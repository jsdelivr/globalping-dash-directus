import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { Router } from 'express';
import * as sinon from 'sinon';
import endpoint from '../src/index.js';

describe('/sponsorship-details', () => {
	const readOne = sinon.stub();
	const readByQuery = sinon.stub();
	const endpointContext = {
		logger: {
			error: console.error,
		},
		getSchema: () => ({}),
		database: () => ({}),
		services: {
			UsersService: sinon.stub().callsFake(() => {
				return { readOne };
			}),
			ItemsService: sinon.stub().callsFake(() => {
				return { readByQuery };
			}),
		},
		env: {
			CREDITS_BONUS_PER_100_DOLLARS: '10',
			MAX_CREDITS_BONUS: '1000',
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

	beforeEach(() => {
		sinon.resetHistory();
		readByQuery.resolves([]);

		readOne.resolves({
			external_identifier: 'test-github-id',
		});
	});

	it('should return sponsorship details for valid user request', async () => {
		(endpoint as any)(router, endpointContext);
		const req = {
			accountability: {
				user: 'user-id',
				admin: false,
			},
			query: {
				userId: 'user-id',
			},
		};

		readByQuery.resolves([
			{ meta: { amountInDollars: 30 } },
			{ meta: { amountInDollars: 30 } },
			{ meta: { amountInDollars: 30 } },
			{ meta: { amountInDollars: 30 } },
			{ meta: { amountInDollars: 100 } },
		]);

		await request('/', req, res);

		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]?.[0]).to.deep.equal({
			bonus: 20,
			donatedInLastYear: 220,
		});

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('user-id');
	});

	it('should return empty details for non-sponsor user', async () => {
		(endpoint as any)(router, endpointContext);
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

		expect(resSend.args[0]?.[0]).to.deep.equal({
			bonus: 0,
			donatedInLastYear: 0,
		});

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('user-id');
	});

	it('should reject user request for another user', async () => {
		(endpoint as any)(router, endpointContext);
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
		(endpoint as any)(router, endpointContext);
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

		expect(resSend.callCount).to.equal(1);

		expect(resSend.args[0]?.[0]).to.deep.equal({
			bonus: 0,
			donatedInLastYear: 0,
		});

		expect(readOne.callCount).to.equal(1);
		expect(readOne.args[0]?.[0]).to.equal('another-user-id');
	});

	it('should reject request without accountability', async () => {
		(endpoint as any)(router, endpointContext);
		const req = {
			query: {
				userId: 'user-id',
			},
		};

		await request('/', req, res);

		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.args[0]).to.deep.equal([ '"accountability" is required' ]);
	});

	it('should reject request without userId', async () => {
		(endpoint as any)(router, endpointContext);
		const req = {
			accountability: {
				user: 'user-id',
				admin: false,
			},
			query: {},
		};

		await request('/', req, res);

		expect(resStatus.args[0]).to.deep.equal([ 400 ]);
		expect(resSend.args[0]).to.deep.equal([ '"query.userId" is required' ]);
	});
});
