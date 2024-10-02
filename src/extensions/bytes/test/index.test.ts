import { expect } from 'chai';
import type { Router } from 'express';
import * as sinon from 'sinon';
import endpoint from '../src/generator/index.js';
import { WrongValueError } from '../src/utils/bytes.js';
import hook from '../src/validator/index.js';

type FilterCallback = (payload: any) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('/generator', () => {
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

	describe('gp_tokens.items.create hook', () => {
		it('should accept generated token on create', async () => {
			const req = {
				accountability: {
					user: 'requester-id',
				},
			};

			await request('/', req, res);
			const token = resSend.args[0]?.[0].data;
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
			const req = {
				accountability: {
					user: '',
				},
			};

			await request('/', req, res);
			expect(next.args[0]?.[0].message).to.deep.equal('"accountability.user" is not allowed to be empty');
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

			expect(error).to.deep.equal(new WrongValueError());
		});
	});

	describe('gp_apps.items.create hook', () => {
		it('should generate bigger amount of bytes', async () => {
			const req = {
				accountability: {
					user: 'requester-id',
				},
				body: {
					size: 'lg',
				},
			};

			await request('/', req, res);
			const token = resSend.args[0]?.[0].data;
			expect(token.length).to.equal(48);

			const payload = {
				secrets: [ token ],
			};
			callbacks.filter['gp_apps.items.create']?.(payload);

			expect(payload.secrets).to.not.deep.equal([ token ]);
		});

		it('should reject if there is a wrong value in array, then work when it is removed', async () => {
			const req = {
				accountability: {
					user: 'requester-id',
				},
				body: {
					size: 'lg',
				},
			};

			await request('/', req, res);
			const token = resSend.args[0]?.[0].data;
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
