import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any) => Promise<any>;

describe('notifications hooks', () => {
	const readOne = sinon.stub();
	const getSchema = sinon.stub().resolves({});

	const UsersService = sinon.stub().returns({ readOne });

	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => { callbacks.filter[name] = cb; },
	} as any;

	hook(events, { services: { UsersService }, getSchema } as any);

	beforeEach(() => {
		sinon.resetHistory();
	});

	describe('filter notifications.create', () => {
		const filter = () => callbacks.filter['notifications.create']!;

		it('should throw on invalid payload (missing type)', async () => {
			try {
				await filter()({ message: 'test', recipient: 'user-1', subject: 'test' });
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

		it('should throw if user not found', async () => {
			readOne.resolves(null);

			try {
				await filter()({ type: 'probe_adopted', message: 'test', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('User for notification not found.');
			}
		});

		it('should send configurable notification if notification_preferences is null', async () => {
			readOne.resolves({ email: 'user@example.com', notification_preferences: null });

			const payload = { type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should send configurable notification if user explicitly enabled the type', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: { probe_adopted: { enabled: true } },
			});

			const payload = { type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should send non-configurable notification even if user explicitly disabled the type', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					welcome: { enabled: false, emailEnabled: false },
				},
			});

			const payload = { type: 'welcome', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should send non-configurable notification even if all configured types are disabled', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_adopted: { enabled: false, emailEnabled: false },
					probe_unassigned: { enabled: false, emailEnabled: false },
				},
			});

			const payload = { type: 'welcome', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should cancel when user explicitly disabled this type', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_adopted: { enabled: false },
					probe_unassigned: { enabled: true },
				},
			});

			try {
				await filter()({ type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should send in-app when user explicitly enabled this type', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_adopted: { enabled: true },
				},
			});

			const payload = { type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should cancel configurable notification if all configured types are disabled and this type is not configured', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					outdated_software: { enabled: false, emailEnabled: false },
					probe_unassigned: { enabled: false, emailEnabled: false },
				},
			});

			try {
				await filter()({ type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should ignore readOnly in allDisabled calculation', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_unassigned: { enabled: false, emailEnabled: false },
					outdated_software: { enabled: true, emailEnabled: true },
				},
			});

			try {
				await filter()({ type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' });
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should not set "allDisabled: true" from readOnly type alone', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					outdated_software: { enabled: false, emailEnabled: false },
				},
			});

			const payload = { type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should set email_status=not-required for non-email notification type', async () => {
			readOne.resolves({ email: 'user@example.com', notification_preferences: null });

			const payload = { type: 'probe_adopted', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'not-required' });
		});

		it('should set email_status=no-email for email notification type without user email', async () => {
			readOne.resolves({ email: null, notification_preferences: null });

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'no-email' });
		});

		it('should set email_status=pending for email notification type with user email', async () => {
			readOne.resolves({ email: 'user@example.com', notification_preferences: null });

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'pending' });
		});

		it('should set email_status=pending when user explicitly enabled email for type', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_unassigned: { enabled: false, emailEnabled: false },
					outdated_software: { enabled: true, emailEnabled: true },
				},
			});

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'pending' });
		});

		it('should set email_status=disabled-by-user for outdated_firmware when prefs have disabled outdated_software', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_unassigned: { enabled: true, emailEnabled: true },
					outdated_software: { enabled: true, emailEnabled: false },
				},
			});

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'disabled-by-user' });
		});

		it('should set email_status=disabled-by-user for outdated_software payload prefs have disabled outdated_software', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					probe_unassigned: { enabled: true, emailEnabled: true },
					outdated_software: { enabled: true, emailEnabled: false },
				},
			});

			const payload = { type: 'outdated_software', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'disabled-by-user' });
		});

		it('should set email_status=disabled-by-user when all configured email types are disabled', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					outdated_software: { enabled: true, emailEnabled: false },
					offline_probe: { enabled: true, emailEnabled: false },
				},
			});

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'disabled-by-user' });
		});

		it('should set email_status=pending when not all configured email types are disabled', async () => {
			readOne.resolves({
				email: 'user@example.com',
				notification_preferences: {
					outdated_software: { enabled: true, emailEnabled: true },
					offline_probe: { enabled: true, emailEnabled: false },
				},
			});

			const payload = { type: 'outdated_firmware', message: 'body', recipient: 'user-1', subject: 'test' };
			const result = await filter()(payload);
			expect(result).to.deep.equal({ ...payload, email_status: 'pending' });
		});
	});
});
