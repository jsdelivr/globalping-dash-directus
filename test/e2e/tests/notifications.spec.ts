import { test, expect } from '../fixtures.ts';
import axios from 'axios';
import { client } from '../client.ts';

const sendNotification = async (type: string, recipient: string) => {
	await axios.post(`${process.env.DIRECTUS_URL}/notifications`, {
		type,
		recipient,
		subject: type,
		message: `${type} message`,
	}, {
		headers: {
			Authorization: `Bearer ${process.env.GP_SYSTEM_KEY}`,
		},
	});
};

test('Notifications are sent when preferences are null', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({ notification_preferences: null });
	await page.goto('/settings');

	await sendNotification('probe_adopted', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('probe_adopted').first()).toBeVisible();
});

test('If all notification types are disabled, unspecified notification types are not sent', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			probe_adopted: { enabled: false },
			outdated_software: { enabled: false },
		}),
	});

	await page.goto('/settings');

	await sendNotification('probe_unassigned', user.id);
	await sendNotification('welcome', user.id);
	await sendNotification('probe_adopted', user.id);
	await sendNotification('offline_probe', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('probe_unassigned').first()).not.toBeVisible();
	await expect(page.getByText('welcome').first()).toBeVisible();
	await expect(page.getByText('probe_adopted').first()).not.toBeVisible();
	await expect(page.getByText('offline_probe').first()).not.toBeVisible();
});

test('If some notification types are enabled, unspecified notification types are sent', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({
		notification_preferences: JSON.stringify({
			probe_adopted: { enabled: false },
			probe_unassigned: { enabled: true },
		}),
	});

	await page.goto('/settings');

	await sendNotification('outdated_firmware', user.id);
	await sendNotification('welcome', user.id);
	await sendNotification('probe_adopted', user.id);
	await sendNotification('offline_probe', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('outdated_firmware').first()).toBeVisible();
	await expect(page.getByText('welcome').first()).toBeVisible();
	await expect(page.getByText('probe_adopted').first()).not.toBeVisible();
	await expect(page.getByText('offline_probe').first()).toBeVisible();
});

test('Toggles of notification types', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({ notification_preferences: null });
	await page.goto('/settings');

	const probeAdoptedSection = page.getByText('Probe successfully adopted').locator('..');
	await probeAdoptedSection.getByRole('switch').first().click();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect.poll(async () => {
		const userData = await client('directus_users').where({ id: user.id }).select('notification_preferences').first();
		return JSON.parse(userData.notification_preferences)?.probe_adopted?.enabled;
	}).toBe(false);

	await sendNotification('probe_adopted', user.id);
	await sendNotification('probe_unassigned', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('probe_adopted').first()).not.toBeVisible();
	await expect(page.getByText('probe_unassigned').first()).toBeVisible();
});
