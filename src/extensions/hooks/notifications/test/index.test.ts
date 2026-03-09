import type { HookExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any) => Promise<any>;
type ActionCallback = (meta: any) => Promise<void>;

describe('notifications hooks', () => {
	const readOne = sinon.stub();
	const send = sinon.stub();
	const getSchema = sinon.stub().resolves({});

	const UsersService = sinon.stub().returns({ readOne });
	const MailService = sinon.stub().returns({ send });

	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
		action: {} as Record<string, ActionCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => { callbacks.filter[name] = cb; },
		action: (name: string, cb: ActionCallback) => { callbacks.action[name] = cb; },
	} as any;

	hook(events, { services: { UsersService, MailService }, getSchema } as unknown as HookExtensionContext);

	beforeEach(() => {
		sinon.resetHistory();
	});

	describe('filter notifications.create', () => {
		const filter = () => callbacks.filter['notifications.create']!;

		it('should throw on invalid payload (missing type)', async () => {
			try {
				await filter()({ recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.include('"type" is required');
			}
		});

		it('should throw on invalid payload (invalid type)', async () => {
			try {
				await filter()({ type: 'invalid_type', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.include('"type" must be one of');
			}
		});

		it('should skip checks for skipChecks notification types', async () => {
			const payload = { type: 'welcome', recipient: 'user-1', subject: 'Hello' };
			const result = await filter()(payload);
			expect(result).to.equal(payload);
			expect(readOne.callCount).to.equal(0);
		});

		it('should throw if user not found', async () => {
			readOne.resolves(null);

			try {
				await filter()({ type: 'probe_adopted', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('User for notification not found.');
			}
		});

		it('should send if notification_preferences is null', async () => {
			readOne.resolves({ notification_preferences: null });

			const payload = { type: 'probe_adopted', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.equal(payload);
		});

		it('should send if user explicitly enabled the type', async () => {
			readOne.resolves({ notification_preferences: { probe_adopted: { enabled: true, emailEnabled: true } } });

			const payload = { type: 'probe_adopted', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.equal(payload);
		});

		it('should cancel if user explicitly disabled the type', async () => {
			readOne.resolves({ notification_preferences: { probe_adopted: { enabled: false, emailEnabled: true } } });

			try {
				await filter()({ type: 'probe_adopted', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should cancel if user has disabled other types and this type is not configured', async () => {
			readOne.resolves({ notification_preferences: { offline_probe: { enabled: false, emailEnabled: true } } });

			try {
				await filter()({ type: 'probe_adopted', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should send if preferences object is empty', async () => {
			readOne.resolves({ notification_preferences: {} });

			const payload = { type: 'probe_adopted', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.equal(payload);
		});

		it('should send if all configured types are enabled and this type is not configured', async () => {
			readOne.resolves({ notification_preferences: { offline_probe: { enabled: true, emailEnabled: true } } });

			const payload = { type: 'probe_adopted', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.equal(payload);
		});
	});

	// describe('action notifications.create', () => {
	// 	const action = () => callbacks.action['notifications.create']!;

	// 	it('should not send email if user has no email', async () => {
	// 		readOne.resolves({ email: null, notification_preferences: null });

	// 		await action()({ payload: { type: 'welcome', recipient: 'user-1', subject: 'Hello', message: 'body' } });
	// 		expect(send.callCount).to.equal(0);
	// 	});

	// 	it('should send email for skipChecks types regardless of preferences', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: { welcome: { enabled: false, emailEnabled: false } } });

	// 		await action()({ payload: { type: 'welcome', recipient: 'user-1', subject: 'Hello', message: 'body' } });
	// 		expect(send.callCount).to.equal(1);
	// 		expect(send.args[0]![0]).to.deep.equal({ to: 'test@test.com', subject: 'Hello', text: 'body' });
	// 	});

	// 	it('should send email if notification_preferences is null', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: null });

	// 		await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'test', message: 'body' } });
	// 		expect(send.callCount).to.equal(1);
	// 		expect(send.args[0]![0]).to.deep.equal({ to: 'test@test.com', subject: 'test', text: 'body' });
	// 	});

	// 	it('should send email if user explicitly enabled emailEnabled', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: { probe_adopted: { enabled: true, emailEnabled: true } } });

	// 		await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'test', message: 'body' } });
	// 		expect(send.callCount).to.equal(1);
	// 	});

	// 	it('should not send email if user explicitly disabled emailEnabled', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: { probe_adopted: { enabled: true, emailEnabled: false } } });

	// 		await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'test', message: 'body' } });
	// 		expect(send.callCount).to.equal(0);
	// 	});

	// 	it('should not send email if user has disabled email for other types and this type is not configured', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: { offline_probe: { enabled: true, emailEnabled: false } } });

	// 		await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'test', message: 'body' } });
	// 		expect(send.callCount).to.equal(0);
	// 	});

	// 	it('should send email if preferences object is empty', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: {} });

	// 		await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'test', message: 'body' } });
	// 		expect(send.callCount).to.equal(1);
	// 	});

	// 	it('should throw if message is undefined', async () => {
	// 		readOne.resolves({ email: 'test@test.com', notification_preferences: null });

	// 		try {
	// 			await action()({ payload: { type: 'probe_adopted', recipient: 'user-1', subject: 'sub' } });
	// 			expect.fail('should throw');
	// 		} catch (err: any) {
	// 			expect(err.message).to.equal('"message" is required');
	// 		}
	// 	});
	// });
});
