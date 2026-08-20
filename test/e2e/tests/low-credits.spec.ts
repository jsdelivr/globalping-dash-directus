import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { User } from '../types.ts';

// Webhook-trigger flow seeded in seeds/development/08-flow-triggers.js; lets us
// run the low-credits cron on demand instead of waiting 5 minutes.
const MANUAL_FLOW_ID = '9fce4936-773d-4942-bfb1-fc608dfda174';

const triggerLowCreditsCron = async () => {
	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${MANUAL_FLOW_ID}`);
};

const addCredits = async (user: User, amount: number, notifiedUsers: string[] = []) => {
	await sql('gp_credits').insert({
		user_id: user.id,
		account_id: user.account_id,
		amount,
		low_credits_notified: JSON.stringify(notifiedUsers),
	});
};

const getNotifiedUsers = async (user: User) => {
	const credits = await sql('gp_credits').where({ user_id: user.id }).select('low_credits_notified').first();
	return JSON.parse(credits.low_credits_notified) as string[];
};

test('notifies the user and flips the flag when amount is at or below the default threshold', async ({ user }) => {
	await addCredits(user, 100);

	await triggerLowCreditsCron();
	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.orderBy('id', 'desc')
		.first();

	expect(notification).toBeTruthy();
	expect(notification.subject).toBe('Your Globalping credits are running low');
	expect(notification.message).toContain('You have 100 credits remaining');

	expect(await getNotifiedUsers(user)).toEqual([ user.id ]);
});

test('resets the flag and does not notify when amount has recovered above the threshold', async ({ user }) => {
	await addCredits(user, 10000, [ user.id ]);

	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.first();
	expect(notification).toBeUndefined();

	expect(await getNotifiedUsers(user)).toEqual([]);
});

test('respects a custom per-user threshold: notifies at amount equal to the custom parameter', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: true, parameter: 8000 },
		}),
	});

	await addCredits(user, 8000);

	await triggerLowCreditsCron();
	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.orderBy('id', 'desc')
		.first();

	expect(notification).toBeTruthy();
	expect(notification.message).toContain('You have 8000 credits remaining');

	expect(await getNotifiedUsers(user)).toEqual([ user.id ]);
});

test('does not notify a user who disabled low_credits notifications', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: false },
		}),
	});

	await addCredits(user, 100);

	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.first();
	expect(notification).toBeUndefined();

	expect(await getNotifiedUsers(user)).toEqual([]);
});

test('resets the flag while disabled, then notifies again after re-enabling', async ({ user }) => {
	await addCredits(user, 100);

	await triggerLowCreditsCron();

	let notifications = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.select('id');
	expect(notifications).toHaveLength(1);

	expect(await getNotifiedUsers(user)).toEqual([ user.id ]);

	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: false },
		}),
	});

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: 10000 });
	await triggerLowCreditsCron();

	notifications = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.select('id');

	expect(notifications).toHaveLength(1);

	expect(await getNotifiedUsers(user)).toEqual([]);

	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: true },
		}),
	});

	await sql('gp_credits').where({ user_id: user.id }).update({ amount: 100 });

	await triggerLowCreditsCron();

	notifications = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.select('id');

	expect(notifications).toHaveLength(2);

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.orderBy('id', 'desc')
		.first();

	expect(notification.message).toContain('You have 100 credits remaining');

	expect(await getNotifiedUsers(user)).toEqual([ user.id ]);
});
