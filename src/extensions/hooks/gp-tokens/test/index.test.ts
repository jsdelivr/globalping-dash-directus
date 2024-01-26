import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

describe('token hooks', () => {
	const callbacks = {
		filter: {},
		action: {},
	};
	const events = {
		filter: (name, cb) => {
			callbacks.filter[name] = cb;
		},
		action: (name, cb) => {
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
		callbacks.filter['gp_tokens.items.create'](payload);

		expect(payload.origins).to.deep.equal([ 'https://www.jsdelivr.com' ]);
	});

	it('should add missing protocol', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create'](payload);

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});

	it('should not add protocol if it exists', () => {
		const payload = {
			name: 'name',
			value: 'value',
			expire: null,
			origins: [ 'alo://jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.create'](payload);

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
			callbacks.filter['gp_tokens.items.create'](payload);
		} catch (err) {
			error = err;
		}

		expect(error!.message).to.equal('Invalid URL: https://@#$@^%');
	});

	it('should call validation for update too', () => {
		const payload = {
			origins: [ 'jsdelivr.com' ],
		};
		callbacks.filter['gp_tokens.items.update'](payload);

		expect(payload.origins).to.deep.equal([ 'https://jsdelivr.com' ]);
	});
});
