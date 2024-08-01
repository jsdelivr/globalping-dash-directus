import { expect } from 'chai';
import * as sinon from 'sinon';
import type { Router } from 'express';
import endpoint from '../src/token-generator/index.js';
import hook from '../src/token-validator/index.js';
import { WrongTokenError } from '../src/utils/token.js';
import { ForbiddenError } from '@directus/errors';

type FilterCallback = (payload: any) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('/token-generator', () => {
	describe('gp_tokens.items.create hook', () => {
		const resSend = sinon.stub();
		const next = sinon.stub();
		const res = { send: resSend };

		const routes: Record<string, (request: object, response: typeof res, next: () => void) => void> = {};
		const request = (route: string, request: object, response: typeof res) => {
			const handler = routes[route];

			if (!handler) {
				throw new Error('Handler for the route is not defined');
			}

			return handler(request, response, next);
		};
		const router = {
			post: (route: string, handler: (request: object, response: typeof res) => void) => {
				routes[route] = handler;
			},
		} as unknown as Router;

		endpoint(router);

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
		hook(events);

		beforeEach(() => {
			sinon.resetHistory();
		});

		it('should accept generated token on create', async () => {
			const req = {
				accountability: {
					user: 'requester-id',
				},
			};

			await request('/', req, res);
			const token = resSend.args[0]?.[0].data;

			const payload = {
				id: 1,
				name: 'my-token',
				value: token,
			};
			callbacks.filter['gp_tokens.items.create']?.(payload);

			expect(payload.value).to.not.equal(token);
		});

		it('should reject non-authenticated user', async () => {
			const req = {
				accountability: {
					user: '',
				},
			};

			await request('/', req, res);
			expect(next.args[0]?.[0]).to.deep.equal(new ForbiddenError());
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

			expect(error).to.deep.equal(new WrongTokenError());
		});

		it('should accept no token in the payload on edit', async () => {
			callbacks.filter['gp_tokens.items.update']?.({
				name: 'my-token-2',
			});
		});

		it('should accept generated token on edit', async () => {
			const req = {
				accountability: {
					user: 'requester-id',
				},
			};

			await request('/', req, res);
			const token = resSend.args[0]?.[0].data;

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

			expect(error).to.deep.equal(new WrongTokenError());
		});
	});
});
