import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import express, { type NextFunction } from 'express';
import * as sinon from 'sinon';
import request from 'supertest';
import { WrongValueError } from '../../lib/src/bytes.js';
import endpoint from '../src/generator/index.js';
import hook from '../src/validator/index.js';

type FilterCallback = (payload: any) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('/generator', () => {
	const app = express();
	app.use(express.json());
	let accountability: { user: string } | Record<string, never> = {};
	app.use(((req: any, _res: any, next: NextFunction) => {
		req.accountability = accountability;
		next();
	}) as NextFunction);

	const router = express.Router();
	(endpoint as any)(router, { logger: console.error } as any);
	app.use(router);

	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
		action: {} as Record<string, ActionCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => {
			callbacks.filter[name] = cb;
		},
		action: (name: string, cb: ActionCallback) => {
			callbacks.action[name] = cb;
		},
	} as any;
	hook(events, {} as HookExtensionContext);

	beforeEach(() => {
		sinon.resetHistory();

		accountability = {
			user: 'requester-id',
		};
	});

	describe('gp_tokens.items.create hook', () => {
		it('should accept generated token on create', async () => {
			const res = await request(app).post('/').send({});

			expect(res.status).to.equal(200);
			const token = res.body.data;
			expect(token.length).to.equal(32);

			const payload = {
				id: 1,
				name: 'my-token',
				value: token,
			};
			callbacks.filter['gp_tokens.items.create']?.(payload);

			expect(payload.value).to.not.equal(token);
		});

		it('should reject non-authenticated user', async () => {
			accountability = {
				user: '',
			};

			const res = await request(app).post('/').send({});

			expect(res.status).to.equal(400);
			expect(res.text).to.equal('"accountability.user" is not allowed to be empty');
		});

		it('should reject wrong token on create', async () => {
			let error = null;

			try {
				callbacks.filter['gp_tokens.items.create']?.({
					id: 1,
					name: 'my-token',
					value: 'wrong-token',
				});
			} catch (err) {
				error = err;
			}

			expect(error).to.deep.equal(new WrongValueError());
		});

		it('should accept no token in the payload on edit', async () => {
			callbacks.filter['gp_tokens.items.update']?.({
				name: 'my-token-2',
			});
		});

		it('should accept generated token on edit', async () => {
			const res = await request(app).post('/').send({});

			expect(res.status).to.equal(200);
			const token = res.body.data;

			const payload = {
				value: token,
			};
			callbacks.filter['gp_tokens.items.update']?.(payload);

			expect(payload.value).to.not.equal(token);
		});

		it('should reject wrong token on edit', async () => {
			let error = null;

			try {
				callbacks.filter['gp_tokens.items.update']?.({
					value: 'wrong-token',
				});
			} catch (err) {
				error = err;
			}

			expect(error).to.deep.equal(new WrongValueError());
		});
	});

	describe('gp_apps.items.create hook', () => {
		it('should generate bigger amount of bytes', async () => {
			const res = await request(app).post('/').send({
				size: 'lg',
			});

			expect(res.status).to.equal(200);
			const token = res.body.data;
			expect(token.length).to.equal(48);

			const payload = {
				secrets: [ token ],
			};
			callbacks.filter['gp_apps.items.create']?.(payload);

			expect(payload.secrets).to.not.deep.equal([ token ]);
		});

		it('should reject if there is a wrong value in array, then work when it is removed', async () => {
			const res = await request(app).post('/').send({
				size: 'lg',
			});

			expect(res.status).to.equal(200);
			const token = res.body.data;
			expect(token.length).to.equal(48);

			let error = null;

			try {
				callbacks.filter['gp_apps.items.create']?.({
					secrets: [ token, 'wrong-value' ],
				});
			} catch (err) {
				error = err;
			}

			expect(error).to.deep.equal(new WrongValueError());

			const payload = {
				secrets: [ token ],
			};
			callbacks.filter['gp_apps.items.create']?.(payload);

			expect(payload.secrets).to.not.deep.equal([ token ]);
		});

		it('should work fine with empty array value', async () => {
			const payload = {
				secrets: [],
			};
			callbacks.filter['gp_apps.items.create']?.(payload);

			expect(payload.secrets).to.deep.equal([]);
		});

		it('should work fine with undefined value', async () => {
			const payload = {} as { secrets: undefined };
			callbacks.filter['gp_apps.items.create']?.(payload);

			expect(payload.secrets).to.equal(undefined);
		});
	});
});
