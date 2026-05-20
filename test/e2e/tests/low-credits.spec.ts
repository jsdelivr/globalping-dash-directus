import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

// Webhook-trigger flow seeded in seeds/development/08-flow-triggers.js; lets us
// run the low-credits cron on demand instead of waiting 5 minutes.
const MANUAL_FLOW_ID = '9fce4936-773d-4942-bfb1-fc608dfda174';

const triggerLowCreditsCron = async () => {
	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${MANUAL_FLOW_ID}`);
};

test('notifies the user and flips the flag when amount is at or below the default threshold', async ({ user }) => {
	await sql('gp_credits').insert({
		user_id: user.id,
		amount: 100,
		low_credits_notified: false,
	});

	await triggerLowCreditsCron();
	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.orderBy('id', 'desc')
		.first();

	expect(notification).toBeTruthy();
	expect(notification.subject).toBe('Your Globalping credits are running low');
	expect(notification.message).toContain('You have 100 credits remaining');

	const credits = await sql('gp_credits').where({ user_id: user.id }).select('low_credits_notified').first();
	expect(Boolean(credits.low_credits_notified)).toBe(true);
});

test('resets the flag and does not notify when amount has recovered above the threshold', async ({ user }) => {
	await sql('gp_credits').insert({
		user_id: user.id,
		amount: 10000,
		low_credits_notified: true,
	});

	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.first();
	expect(notification).toBeUndefined();

	const credits = await sql('gp_credits').where({ user_id: user.id }).select('low_credits_notified').first();
	expect(Boolean(credits.low_credits_notified)).toBe(false);
});

test('respects a custom per-user threshold: notifies at amount equal to the custom parameter', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: true, parameter: 8000 },
		}),
	});

	await sql('gp_credits').insert({
		user_id: user.id,
		amount: 8000,
		low_credits_notified: false,
	});

	await triggerLowCreditsCron();
	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.orderBy('id', 'desc')
		.first();

	expect(notification).toBeTruthy();
	expect(notification.message).toContain('You have 8000 credits remaining');

	const credits = await sql('gp_credits').where({ user_id: user.id }).select('low_credits_notified').first();
	expect(Boolean(credits.low_credits_notified)).toBe(true);
});

test('does not notify a user who disabled low_credits notifications', async ({ user }) => {
	await sql('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			low_credits: { enabled: false },
		}),
	});

	await sql('gp_credits').insert({
		user_id: user.id,
		amount: 100,
		low_credits_notified: false,
	});

	await triggerLowCreditsCron();

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.first();
	expect(notification).toBeUndefined();

	// Flag stays false: user is excluded from the bulk path and has no custom threshold,
	// so they never enter either branch.
	const credits = await sql('gp_credits').where({ user_id: user.id }).select('low_credits_notified').first();
	expect(Boolean(credits.low_credits_notified)).toBe(false);
});
