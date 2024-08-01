import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

describe('token hooks', () => {
	const callbacks = {
		filter: {} as Record<string, (payload: any) => void>,
		action: {} as Record<string, (meta: any, context: any) => void>,
	};
	const events = {
		filter: (name: string, cb: (payload: any) => void) => {
			callbacks.filter[name] = cb;
		},
		action: (name: string, cb: (meta: any, context: any) => void) => {
			callbacks.action[name] = cb;
		},
	} as any;

	hook(events);

	beforeEach(() => {
		sinon.resetHistory();
	});

	it('should remove trailing slash', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'https://www.jsdelivr.com/' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'https://www.jsdelivr.com' ]);
	});

	it('should add missing protocol', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});

	it('should not add protocol if it exists', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'alo://jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create']?.(payload);

		expect(payload.origins).to.deep.equal([ 'alo://jsdelivr.com' ]);
	});

	it('should reject invalid origin', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ '@#$@^%' ],
		};

		let error: Error;

		try {
			callbacks.filter['gp_tokens.items.create']?.(payload);
		} catch (err) {
			error = err as Error;
		}

		expect(error!.message).to.equal('Invalid URL: https://@#$@^%');
	});

	it('should call validation for update too', () => {
		const payload = {
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.update']?.(payload);

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});
});
