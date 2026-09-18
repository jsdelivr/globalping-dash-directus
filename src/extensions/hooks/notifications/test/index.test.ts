import { expect } from 'chai';
import * as sinon from 'sinon';
import hook from '../src/index.js';

type FilterCallback = (payload: any, meta?: any, context?: any) => Promise<any>;

describe('notifications hooks', () => {
	const readOne = sinon.stub();
	const createOne = sinon.stub();
	const getSchema = sinon.stub().resolves({});

	const UsersService = sinon.stub().returns({ readOne });
	const NotificationsService = sinon.stub().returns({ createOne });
	const readByQuery = sinon.stub();
	const ItemsService = sinon.stub().returns({ readByQuery });

	const first = sinon.stub();
	const select = sinon.stub();
	const queryBuilder = {
		where: sinon.stub(),
		join: sinon.stub(),
		first,
		select,
	};
	queryBuilder.where.returns(queryBuilder);
	queryBuilder.join.returns(queryBuilder);
	const database = sinon.stub().returns(queryBuilder);

	const callbacks = {
		filter: {} as Record<string, FilterCallback>,
	};
	const events = {
		filter: (name: string, cb: FilterCallback) => { callbacks.filter[name] = cb; },
	} as any;

	hook(events, { services: { UsersService, NotificationsService, ItemsService }, getSchema } as any);

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

	describe('filter notifications.create with account', () => {
		const filter = () => callbacks.filter['notifications.create']!;
		const eventContext = { database };

		beforeEach(() => {
			first.reset();
			select.reset();
			readOne.resolves({ email: 'user@example.com', notification_preferences: null });
			createOne.resolves('notification-id');
		});

		it('should reject a payload with neither recipient nor account', async () => {
			try {
				await filter()({ type: 'probe_adopted', message: 'test', subject: 'test' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.include('must contain at least one of');
			}
		});

		it('should throw if the account is not found', async () => {
			first.resolves(undefined);

			try {
				await filter()({ type: 'probe_adopted', message: 'test', subject: 'test', account: 'ghost' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Account for notification not found.');
			}
		});

		it('should resolve a user account into the recipient', async () => {
			first.resolves({ user: 'user-1', org: null });

			const result = await filter()({ type: 'probe_adopted', message: 'test', subject: 'test', account: 'account-1' }, {}, eventContext);

			expect(result.recipient).to.equal('user-1');
			expect(result.account).to.equal(undefined);
			expect(result.email_status).to.equal('not-required');
		});

		it('should apply the org preferences of the recipient the sender picked', async () => {
			first.resolves({ user: null, org: 'org-1' });

			readByQuery.resolves([
				{ user: { id: 'admin-1', email: 'a1@example.com' }, notification_preferences: { low_credits: { enabled: true, parameter: 8000 } } },
			]);

			const result = await filter()({ type: 'low_credits', message: 'test', subject: 'test', account: 'account-1', recipient: 'admin-1' }, {}, eventContext);

			// The personal preferences of that user are not read at all.
			expect(readOne.callCount).to.equal(0);
			expect(createOne.callCount).to.equal(0);

			expect(result).to.deep.equal({
				type: 'low_credits',
				message: 'test',
				subject: 'test',
				recipient: 'admin-1',
				email_status: 'pending',
			});
		});

		it('should cancel when the picked recipient disabled the type in that org', async () => {
			first.resolves({ user: null, org: 'org-1' });

			readByQuery.resolves([
				{ user: { id: 'admin-1', email: 'a1@example.com' }, notification_preferences: { low_credits: { enabled: false } } },
			]);

			try {
				await filter()({ type: 'low_credits', message: 'test', subject: 'test', account: 'account-1', recipient: 'admin-1' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should cancel when the picked recipient is not a member of the org any more', async () => {
			first.resolves({ user: null, org: 'org-1' });
			readByQuery.resolves([]);

			try {
				await filter()({ type: 'low_credits', message: 'test', subject: 'test', account: 'account-1', recipient: 'admin-1' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}
		});

		it('should reject a recipient that is not the owner of a personal account', async () => {
			first.resolves({ user: 'user-1', org: null });

			try {
				await filter()({ type: 'probe_adopted', message: 'test', subject: 'test', account: 'account-1', recipient: 'user-2' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('The recipient does not belong to the account.');
			}
		});

		it('should fan out an org account to the admins only and cancel the original', async () => {
			first.resolves({ user: null, org: 'org-1' });

			readByQuery.resolves([
				{ user: { id: 'admin-1', email: 'a1@example.com' }, notification_preferences: null },
				{ user: { id: 'admin-2', email: 'a2@example.com' }, notification_preferences: { probe_adopted: { enabled: false } } },
			]);

			try {
				await filter()({ type: 'probe_adopted', message: 'test', subject: 'test', account: 'account-1', collection: 'gp_probes', item: 'probe-1', secondary_type: 'v20.13.0' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}

			// admin-2 has the type disabled in the org preferences.
			expect(createOne.callCount).to.equal(1);

			expect(createOne.args[0]?.[0]).to.deep.equal({
				recipient: 'admin-1',
				type: 'probe_adopted',
				subject: 'test',
				message: 'test',
				collection: 'gp_probes',
				item: 'probe-1',
				secondary_type: 'v20.13.0',
				email_status: 'not-required',
			});

			expect(createOne.args[0]?.[1]).to.deep.equal({ emitEvents: false });
		});

		it('should compute the email status from the admin org preferences', async () => {
			first.resolves({ user: null, org: 'org-1' });

			readByQuery.resolves([
				{ user: { id: 'admin-1', email: 'a1@example.com' }, notification_preferences: { offline_probe: { enabled: true, emailEnabled: false } } },
				{ user: { id: 'admin-2', email: null }, notification_preferences: null },
			]);

			try {
				await filter()({ type: 'offline_probe', message: 'test', subject: 'test', account: 'account-1' }, {}, eventContext);
				expect.fail('should throw');
			} catch (err: any) {
				expect(err.message).to.equal('Notification cancelled by user preferences.');
			}

			expect(createOne.callCount).to.equal(2);
			expect(createOne.args[0]?.[0].email_status).to.equal('disabled-by-user');
			expect(createOne.args[1]?.[0].email_status).to.equal('no-email');
		});
	});
});
