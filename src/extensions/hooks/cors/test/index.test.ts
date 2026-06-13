import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import type { NextFunction, Request, Response } from 'express';
import * as sinon from 'sinon';
import defineHook, { createCorsMiddleware, isTrustedOrigin } from '../src/index.js';

type InitCallback = ({ app }: { app: any }) => void;

describe('cors hook', () => {
	describe('isTrustedOrigin', () => {
		it('accepts globalping.io and its HTTPS subdomains', () => {
			expect(isTrustedOrigin('https://globalping.io')).to.equal(true);
			expect(isTrustedOrigin('https://dash.globalping.io')).to.equal(true);
			expect(isTrustedOrigin('https://staging.globalping.io')).to.equal(true);
			expect(isTrustedOrigin('https://foo.bar.globalping.io')).to.equal(true);
		});

		it('accepts local development dashboard origins', () => {
			expect(isTrustedOrigin('http://localhost:13000')).to.equal(true);
			expect(isTrustedOrigin('http://localhost:13010')).to.equal(true);
			expect(isTrustedOrigin('http://localhost:23000')).to.equal(true);
			expect(isTrustedOrigin('http://localhost:23010')).to.equal(true);
			expect(isTrustedOrigin('http://127.0.0.1:23010')).to.equal(true);
		});

		it('rejects lookalike, invalid, and wrong-protocol origins', () => {
			expect(isTrustedOrigin('https://evilglobalping.io')).to.equal(false);
			expect(isTrustedOrigin('https://globalping.io.evil.com')).to.equal(false);
			expect(isTrustedOrigin('http://globalping.io')).to.equal(false);
			expect(isTrustedOrigin('https://localhost:13000')).to.equal(false);
			expect(isTrustedOrigin('not a url')).to.equal(false);
			expect(isTrustedOrigin(undefined)).to.equal(false);
		});
	});

	describe('createCorsMiddleware', () => {
		it('reflects trusted origins and continues non-preflight requests', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://dash.globalping.io' },
				method: 'GET',
			} as Request;
			const res = { getHeader: sinon.stub(), setHeader: sinon.stub(), sendStatus: sinon.stub() } as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Allow-Origin', 'https://dash.globalping.io')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Vary', 'Origin')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Allow-Credentials', 'true')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,PUT,OPTIONS')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Allow-Headers', 'Content-Type,Authorization')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Expose-Headers', 'Content-Range')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).calledWith('Access-Control-Max-Age', '300')).to.equal(true);
			expect((next as sinon.SinonStub).callCount).to.equal(1);
			expect((res.sendStatus as sinon.SinonStub).callCount).to.equal(0);
		});

		it('ends trusted preflight requests with 204', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://globalping.io' },
				method: 'OPTIONS',
			} as Request;
			const res = { getHeader: sinon.stub(), setHeader: sinon.stub(), sendStatus: sinon.stub() } as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.sendStatus as sinon.SinonStub).calledOnceWith(204)).to.equal(true);
			expect((next as sinon.SinonStub).callCount).to.equal(0);
		});

		it('does not add CORS headers for untrusted origins', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://globalping.io.evil.com' },
				method: 'GET',
			} as Request;
			const res = { getHeader: sinon.stub(), setHeader: sinon.stub(), sendStatus: sinon.stub() } as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.setHeader as sinon.SinonStub).calledOnceWith('Vary', 'Origin')).to.equal(true);
			expect((next as sinon.SinonStub).callCount).to.equal(1);
		});

		it('adds Vary Origin for untrusted origins', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://globalping.io.evil.com' },
				method: 'GET',
			} as Request;
			const res = { getHeader: sinon.stub(), setHeader: sinon.stub(), sendStatus: sinon.stub() } as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.setHeader as sinon.SinonStub).calledOnceWith('Vary', 'Origin')).to.equal(true);
			expect((res.setHeader as sinon.SinonStub).neverCalledWith('Access-Control-Allow-Origin')).to.equal(true);
			expect((next as sinon.SinonStub).callCount).to.equal(1);
		});

		it('preserves existing Vary values when adding Origin', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://dash.globalping.io' },
				method: 'GET',
			} as Request;
			const res = {
				getHeader: sinon.stub().withArgs('Vary').returns('Accept-Encoding'),
				setHeader: sinon.stub(),
				sendStatus: sinon.stub(),
			} as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.setHeader as sinon.SinonStub).calledWith('Vary', 'Accept-Encoding, Origin')).to.equal(true);
		});

		it('does not duplicate existing Vary Origin values', () => {
			const middleware = createCorsMiddleware();
			const req = {
				headers: { origin: 'https://dash.globalping.io' },
				method: 'GET',
			} as Request;
			const res = {
				getHeader: sinon.stub().withArgs('Vary').returns([ 'Accept-Encoding', 'origin' ]),
				setHeader: sinon.stub(),
				sendStatus: sinon.stub(),
			} as unknown as Response;
			const next = sinon.stub() as unknown as NextFunction;

			middleware(req, res, next);

			expect((res.setHeader as sinon.SinonStub).neverCalledWith('Vary')).to.equal(true);
		});
	});

	it('registers before Directus middlewares', () => {
		const app = { use: sinon.stub() };
		const callbacks = {
			init: {} as Record<string, InitCallback>,
		};
		const events = {
			init: (name: string, cb: InitCallback) => {
				callbacks.init[name] = cb;
			},
		} as any;

		defineHook(events, {} as HookExtensionContext);
		callbacks.init['middlewares.before']?.({ app });

		expect(app.use.callCount).to.equal(1);
	});
});
