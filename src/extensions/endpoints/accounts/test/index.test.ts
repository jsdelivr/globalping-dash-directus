import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import request from 'supertest';
import endpoint from '../src/index.js';

describe('/accounts endpoint', () => {
	const firstStub = sinon.stub();
	const updateStub = sinon.stub();
	const rawStub = sinon.stub();
	const whereStub = sinon.stub();

	const database = new Proxy(() => database, {
		get: (_target, property) => {
			if (property === 'first') {
				return firstStub;
			} else if (property === 'update') {
				return updateStub;
			} else if (property === 'raw') {
				return rawStub;
			} else if (property === 'where') {
				return whereStub;
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
	let accountability: { user: string; session?: string } = { user: 'user-id' };
	let claims: Record<string, string> = {};
	const tokenWith = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		req.token = tokenWith(claims);
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, endpointContext);
	app.use(router);

	const ACCOUNT_ID = '3f2c1a9e-7d4b-4c8e-9f1a-2b3c4d5e6f70';

	beforeEach(() => {
		sinon.resetHistory();
		whereStub.returns(database);
		firstStub.resolves({ active_account: null });
		updateStub.resolves(1);
		rawStub.resolves([ [{ role: 'member' }] ]);
		accountability = { user: 'user-id', session: 'session-token' };
		claims = {};
	});

	describe('GET /active', () => {
		it('should return the active account claim of the token', async () => {
			claims = { active_account_id: ACCOUNT_ID };

			const res = await request(app).get('/active');

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal({ accountId: ACCOUNT_ID });
			expect(whereStub.callCount).to.equal(0);
		});
	});

	describe('POST /active', () => {
		it('should store the own account of the user', async () => {
			rawStub.resolves([ [{ role: 'owner' }] ]);

			const res = await request(app).post('/active').send({ accountId: ACCOUNT_ID });

			expect(res.status).to.equal(200);
			expect(res.body).to.deep.equal({ accountId: ACCOUNT_ID });
			expect(rawStub.args[0]?.[1]).to.deep.equal({ user: 'user-id', account: ACCOUNT_ID });
			expect(whereStub.args[0]).to.deep.equal([{ token: 'session-token' }]);
			expect(updateStub.args[0]).to.deep.equal([{ active_account: ACCOUNT_ID }]);
		});

		it('should store an org account for a member', async () => {
			const res = await request(app).post('/active').send({ accountId: ACCOUNT_ID });

			expect(res.status).to.equal(200);
			expect(updateStub.args[0]).to.deep.equal([{ active_account: ACCOUNT_ID }]);
		});

		it('should refuse an account the user is not a member of', async () => {
			rawStub.resolves([ [] ]);

			const res = await request(app).post('/active').send({ accountId: ACCOUNT_ID });

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('You can not access this account.');
			expect(updateStub.callCount).to.equal(0);
		});

		it('should refuse a request without a session', async () => {
			accountability = { user: 'user-id' };

			const res = await request(app).post('/active').send({ accountId: ACCOUNT_ID });

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"accountability.session" is required');
			expect(updateStub.callCount).to.equal(0);
		});

		it('should refuse an account id that is not a guid', async () => {
			const res = await request(app).post('/active').send({ accountId: 'all' });

			expect(res.status).to.equal(400);
			expect(updateStub.callCount).to.equal(0);
		});
	});
});
