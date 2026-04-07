import { expect } from 'chai';
import express from 'express';
import { describe, it, beforeEach } from 'mocha';
import * as sinon from 'sinon';
import request from 'supertest';
import { EmailGenerator } from '../../../lib/src/email-generator.js';
import { configurableNotificationTypes, type NotificationTypeKey } from '../../../lib/src/notification-types.js';
import endpoint from '../src/index.js';

type NotificationPreference = {
	enabled: boolean;
	emailEnabled?: boolean;
};

type NotificationPreferences = Partial<Record<NotificationTypeKey, NotificationPreference>>;

describe('email-unsubscribe endpoint', () => {
	const readOne = sinon.stub();
	const updateOne = sinon.stub().resolves(undefined);
	const usersService = {
		readOne,
		updateOne,
	};
	const UsersService = sinon.stub().callsFake(() => usersService);
	const context = {
		env: {
			DASH_URL: 'https://dash.globalping.io',
			PUBLIC_URL: 'https://dash-directus.globalping.io',
			SECRET: 'test-secret',
		},
		logger: {
			error: sinon.stub(),
		},
		getSchema: async () => ({}),
		services: {
			UsersService,
		},
	};

	const app = express();
	app.use(express.json());
	const router = express.Router();
	(endpoint as any)(router, context as any);
	app.use(router);

	const getData = (userId: string) => {
		const links = new EmailGenerator({
			env: {
				DASH_URL: 'https://dash.globalping.io',
				PUBLIC_URL: 'https://dash-directus.globalping.io',
				SECRET: 'test-secret',
			},
		});
		const unsubscribeLink = links.generateListUnsubscribeLink(userId);
		return new URL(unsubscribeLink).searchParams.get('data')!;
	};

	const getTypeData = (userId: string, type: string) => {
		const links = new EmailGenerator({
			env: {
				DASH_URL: 'https://dash.globalping.io',
				PUBLIC_URL: 'https://dash-directus.globalping.io',
				SECRET: 'test-secret',
			},
		});
		const unsubscribeLink = links.generateTypeUnsubscribeLink(userId, type);
		return new URL(unsubscribeLink).searchParams.get('data')!;
	};

	beforeEach(() => {
		sinon.resetHistory();

		readOne.resolves({
			id: 'user-1',
			notification_preferences: {
				probe_adopted: { enabled: true, emailEnabled: true },
				outdated_software: { enabled: false, emailEnabled: true },
			} as NotificationPreferences,
		});
	});

	it('should unsubscribe all configurable email notifications with POST', async () => {
		const res = await request(app).post('/list-unsubscribe').query({ data: getData('user-1') });

		expect(res.status).to.equal(200);
		expect(updateOne.calledOnce).to.equal(true);
		expect(updateOne.firstCall.args[0]).to.equal('user-1');
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;

		for (const type of configurableNotificationTypes as NotificationTypeKey[]) {
			expect(updated[type]?.emailEnabled).to.equal(false);
		}

		expect(updated.probe_adopted?.enabled).to.equal(true);
		expect(updated.outdated_software?.enabled).to.equal(false);
	});

	it('should unsubscribe all configurable email notifications with GET', async () => {
		const res = await request(app).get('/list-unsubscribe').query({ data: getData('user-1') });

		expect(res.status).to.equal(302);
		expect(res.headers.location).to.equal('https://dash.globalping.io/emails/success');
		expect(updateOne.calledOnce).to.equal(true);
	});

	it('should reject missing data query', async () => {
		const res = await request(app).post('/list-unsubscribe');

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('data is required.');
		expect(updateOne.notCalled).to.equal(true);
	});

	it('should reject invalid token', async () => {
		const res = await request(app).post('/list-unsubscribe').query({ data: 'invalid-token' });

		expect(res.status).to.equal(400);
		expect(res.text).to.equal('Invalid token.');
		expect(updateOne.notCalled).to.equal(true);
	});

	it('should unsubscribe one type with GET', async () => {
		const res = await request(app).get('/type-unsubscribe').query({ data: getTypeData('user-1', 'probe_adopted') });

		expect(res.status).to.equal(302);
		expect(res.headers.location).to.equal('https://dash.globalping.io/emails/success?type=probe_adopted');
		expect(updateOne.calledOnce).to.equal(true);
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;

		expect(updated.probe_adopted?.emailEnabled).to.equal(false);
		expect(updated.outdated_software?.emailEnabled).to.equal(true);
	});

	it('should ignore readOnly in allDisabled calculation during list unsubscribe', async () => {
		readOne.resolves({
			id: 'user-1',
			notification_preferences: {
				probe_unassigned: { enabled: false, emailEnabled: false },
				outdated_software: { enabled: true, emailEnabled: true },
			} as NotificationPreferences,
		});

		const res = await request(app).post('/list-unsubscribe').query({ data: getData('user-1') });

		expect(res.status).to.equal(200);
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;
		expect(updated.probe_adopted?.enabled).to.equal(false);
		expect(updated.probe_adopted?.emailEnabled).to.equal(false);
	});

	it('should ignore readOnly in allDisabled calculation during type unsubscribe', async () => {
		readOne.resolves({
			id: 'user-1',
			notification_preferences: {
				probe_unassigned: { enabled: false, emailEnabled: false },
				outdated_software: { enabled: true, emailEnabled: true },
			} as NotificationPreferences,
		});

		const res = await request(app).get('/type-unsubscribe').query({ data: getTypeData('user-1', 'probe_adopted') });

		expect(res.status).to.equal(302);
		expect(res.headers.location).to.equal('https://dash.globalping.io/emails/success?type=probe_adopted');
		expect(updateOne.calledOnce).to.equal(true);
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;
		expect(updated.probe_adopted?.enabled).to.equal(false);
		expect(updated.probe_adopted?.emailEnabled).to.equal(false);
	});

	it('should generate default preferences from notification types', async () => {
		readOne.resolves({
			id: 'user-1',
			notification_preferences: {
				probe_unassigned: { enabled: true, emailEnabled: true },
			} as NotificationPreferences,
		});

		const res = await request(app).get('/type-unsubscribe').query({ data: getTypeData('user-1', 'probe_adopted') });

		expect(res.status).to.equal(302);
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;
		expect(updated.outdated_software).to.deep.equal({ enabled: true, emailEnabled: true });
		expect(updated.outdated_firmware).to.equal(undefined);
	});

	it('should set default emailEnabled=false for email types when all emails disabled', async () => {
		readOne.resolves({
			id: 'user-1',
			notification_preferences: {
				probe_unassigned: { enabled: true, emailEnabled: false },
			} as NotificationPreferences,
		});

		const res = await request(app).get('/type-unsubscribe').query({ data: getTypeData('user-1', 'probe_adopted') });

		expect(res.status).to.equal(302);
		const updated = updateOne.firstCall.args[1].notification_preferences as NotificationPreferences;
		expect(updated.outdated_software).to.deep.equal({ enabled: true, emailEnabled: false });
	});
});
