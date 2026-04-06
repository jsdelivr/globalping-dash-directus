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

test('Settings page', async ({ page }) => {
	await page.goto('/settings');
	await expect(page.locator('h1')).toHaveText('Settings');

	// Make sure new token value is set to the auth.user after the save.
	await page.getByLabel('Regenerate').click();
	await page.getByLabel('Apply settings').click();

	await page.getByLabel('Last Name').fill('Reid-Dorian');
	await page.getByLabel('elliot').click();
	await page.locator('#defaultPrefix_1').getByText('Scrubs').click();
	await page.getByLabel('Regenerate').click();
	await page.getByLabel('Apply settings').click();

	await page.goto('/settings');
	await expect(page.getByLabel('Last Name')).toHaveValue('Reid-Dorian');
});

test('Delete account', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Delete account').click();
	await page.getByRole('dialog', { name: 'Delete account' }).getByLabel('Delete account').click();
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});

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

	await sendNotification('outdated_firmware', user.id);
	await sendNotification('welcome', user.id);
	await sendNotification('probe_adopted', user.id);
	await sendNotification('offline_probe', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('outdated_firmware').first()).not.toBeVisible();
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
