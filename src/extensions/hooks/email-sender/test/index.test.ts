import { expect } from 'chai';
import * as sinon from 'sinon';
import { EmailService } from '../src/email-sender.js';

type MinimalContext = {
	env: {
		RESEND_API_KEY?: string;
		DASH_URL?: string;
		PUBLIC_URL?: string;
		SECRET?: string;
	};
	logger: {
		error: sinon.SinonStub;
	};
	database: any;
};

const createContext = (rows: any[] = []): MinimalContext => {
	const error = sinon.stub();
	const updates: Array<{ ids: number[]; patch: Record<string, unknown> }> = [];
	const trxUpdate = sinon.stub().resolves(1);
	const trxBuilder = {
		leftJoin: () => trxBuilder,
		select: () => trxBuilder,
		where: () => trxBuilder,
		whereNotNull: () => trxBuilder,
		andWhere: (fn: (q: any) => void) => {
			const query = {
				whereNull: () => query,
				orWhere: () => query,
			};
			fn(query);
			return trxBuilder;
		},
		orderBy: () => trxBuilder,
		limit: () => trxBuilder,
		forUpdate: () => trxBuilder,
		skipLocked: async () => rows,
		whereIn: () => ({
			update: trxUpdate,
		}),
	};
	const trx = (table: string) => {
		if (table === 'directus_notifications as notifications') {
			return trxBuilder;
		}

		return {
			whereIn: (_key: string, ids: number[]) => ({
				update: async (patch: Record<string, unknown>) => {
					updates.push({ ids, patch });
					return 1;
				},
			}),
		};
	};
	const database = (() => ({
		whereIn: (_key: string, ids: number[]) => ({
			update: async (patch: Record<string, unknown>) => {
				updates.push({ ids, patch });
				return 1;
			},
		}),
	})) as any;
	database.transaction = async (cb: (trx: any) => Promise<any>) => cb(trx);
	database.__updates = updates;

	return {
		env: {
			RESEND_API_KEY: 'test-key',
			DASH_URL: 'https://dash.globalping.io',
			PUBLIC_URL: 'https://dash-directus.globalping.io',
			SECRET: 'test-secret',
		},
		logger: { error },
		database,
	};
};

describe('EmailService', () => {
	let sandbox: sinon.SinonSandbox;

	before(() => {
		sandbox = sinon.createSandbox({ useFakeTimers: true });
	});

	after(() => {
		sandbox.restore();
	});

	it('should throw on missing RESEND_API_KEY', () => {
		const context = createContext();
		delete context.env.RESEND_API_KEY;

		expect(() => new EmailService(context as any)).to.throw('RESEND_API_KEY is not set.');
	});

	it('should throw on missing DASH_URL', () => {
		const context = createContext();
		delete context.env.DASH_URL;

		expect(() => new EmailService(context as any)).to.throw('DASH_URL is not set.');
	});

	it('should throw on missing SECRET', () => {
		const context = createContext();
		delete context.env.SECRET;

		expect(() => new EmailService(context as any)).to.throw('SECRET is not set.');
	});

	it('should format markdown links to absolute HTML links', () => {
		const context = createContext();
		const service = new EmailService(context as any);

		const html = (service as any).formatMessage({
			message: 'Probe [link](/probes/1) <script>alert(1)</script>',
			recipient: 'u1',
			type: 'outdated_software',
		});
		expect(html).to.include('href="https://dash.globalping.io/probes/1"');
		expect(html).to.include('https://dash.globalping.io/emails/confirmation?data=');
		expect(html).to.not.include('<script>');
	});

	it('should map batch errors to sent/failed ids', async () => {
		const context = createContext();
		const service = new EmailService(context as any);
		const batchSend = sinon.stub().resolves({
			error: null,
			headers: null,
			data: {
				data: [{ id: 'm1' }],
				errors: [{ index: 1, message: 'bad recipient' }],
			},
		});
		(service as any).client.batch.send = batchSend;

		const result = await (service as any).sendEmails([
			{ id: 10, recipient: 'u1', email: 'a@example.com', subject: 's1', message: 'm1', type: 'outdated_software' },
			{ id: 11, recipient: 'u2', email: 'b@example.com', subject: 's2', message: 'm2', type: 'outdated_firmware' },
		]);

		expect(result).to.deep.equal({ sentIds: [ 10 ], failedIds: [ 11 ] });
		expect(batchSend.firstCall.args[1]).to.include({ batchValidation: 'permissive' });
		expect(batchSend.firstCall.args[0][0].headers['List-Unsubscribe']).to.match(/^<https:\/\/dash-directus\.globalping\.io\/email-unsubscribe\/unsubscribe\?data=.*>$/);
		expect(batchSend.firstCall.args[0][0].headers['List-Unsubscribe-Post']).to.equal('List-Unsubscribe=One-Click');
	});

	it('should update sent and failed statuses in handleEmails', async () => {
		const rows = [
			{ id: 1, recipient: 'u1', email: 'a@example.com', subject: 's1', message: 'm1', type: 'outdated_software' },
			{ id: 2, recipient: 'u2', email: 'b@example.com', subject: 's2', message: 'm2', type: 'outdated_firmware' },
		];
		const context = createContext(rows);
		const service = new EmailService(context as any);
		sinon.stub(service as any, 'sendEmails').resolves({ sentIds: [ 1 ], failedIds: [ 2 ] });

		const count = await (service as any).handleEmails();
		const updates = context.database.__updates;

		expect(count).to.equal(2);
		expect(updates[1]).to.deep.equal({ ids: [ 1 ], patch: { email_status: 'sent' } });
		expect(updates[2]).to.deep.equal({ ids: [ 2 ], patch: { email_status: 'failed' } });
	});

	it('should reschedule immediately when handled full batch', async () => {
		const context = createContext();
		const service = new EmailService(context as any);
		const handleEmailsStub = sinon.stub(service as any, 'handleEmails').resolves(100);
		const scheduleSpy = sinon.spy(service, 'scheduleSend');

		try {
			service.scheduleSend(10);
			await sandbox.clock.tickAsync(10);
			await sandbox.clock.tickAsync(1);
		} finally {
			service.unscheduleSend();
		}

		expect(handleEmailsStub.calledTwice).to.equal(true);
		expect(scheduleSpy.getCall(1).args[0]).to.equal(0);
	});

	it('should log and reschedule with default interval on handleEmails error', async () => {
		const context = createContext();
		const service = new EmailService(context as any);
		const error = new Error('boom');
		sinon.stub(service as any, 'handleEmails').rejects(error);
		const scheduleSpy = sinon.spy(service, 'scheduleSend');

		try {
			service.scheduleSend(10);
			await sandbox.clock.tickAsync(10);
		} finally {
			service.unscheduleSend();
		}

		expect(context.logger.error.calledOnceWithExactly(error)).to.equal(true);
		expect(scheduleSpy.callCount).to.be.greaterThan(1);
		expect(scheduleSpy.getCall(1).args[0]).to.equal(10000);
	});

	it('should wait retry-after seconds before retry on 429', async () => {
		const context = createContext();
		const service = new EmailService(context as any);
		const batchSend = sinon.stub()
			.onFirstCall().resolves({
				error: { statusCode: 429, message: 'rate limit' },
				headers: { 'retry-after': '0.05' },
				data: null,
			})
			.onSecondCall().resolves({
				error: null,
				headers: null,
				data: { data: [{ id: 'm1' }], errors: [] },
			});
		(service as any).client.batch.send = batchSend;

		const sendPromise = (service as any).sendEmails([
			{ id: 10, recipient: 'u1', email: 'a@example.com', subject: 's1', message: 'm1', type: 'outdated_software' },
		]);

		const before = Date.now();
		await sandbox.clock.tickAsync(50);
		expect(Date.now() - before).to.equal(50);

		const result = await sendPromise;
		expect(result).to.deep.equal({ sentIds: [ 10 ], failedIds: [] });
		expect(batchSend.callCount).to.equal(2);
	});
});
