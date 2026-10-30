import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.ts';
import axios from 'axios';
import { client } from '../client.ts';
import { actAsOrg, clearUserData, generateUser, pageAs } from '../utils.ts';
import type { Org } from '../types.ts';
import { LinkGenerator } from '../../../src/extensions/lib/src/link-generator.ts';

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

// What gp-api and the crons send for anything an account owns: the recipients are resolved by Directus.
const sendAccountNotification = async (type: string, account: string, message: string) => {
	await axios.post(`${process.env.DIRECTUS_URL}/notifications`, {
		type,
		account,
		subject: type,
		message,
	}, {
		headers: {
			Authorization: `Bearer ${process.env.GP_SYSTEM_KEY}`,
		},
	});
};

const recipientsOf = async (message: string) => {
	const rows = await client('directus_notifications').where({ message }).select('recipient') as { recipient: string }[];
	return rows.map(row => row.recipient).sort();
};

const notificationEmailStatus = async (recipient: string, type: string) => {
	const row = await client('directus_notifications').where({ recipient, type }).orderBy('id', 'desc').select('email_status').first();
	return row?.email_status ?? null;
};

// The same signed link an email carries in its footer / List-Unsubscribe header.
const unsubscribe = async (userId: string, type?: string) => {
	const links = new LinkGenerator({ env: { DASH_URL: process.env.DASH_URL!, PUBLIC_URL: process.env.DIRECTUS_URL!, SECRET: process.env.SECRET! } });
	const link = type ? links.generateTypeUnsubscribeLink(userId, type) : links.generateListUnsubscribeLink(userId);
	const data = new URL(link).searchParams.get('data');
	await axios.post(`${process.env.DIRECTUS_URL}/email-unsubscribe/unsubscribe`, null, { params: { data } });
};

const membershipPreferences = async (org: Org, userId: string) => {
	const row = await client('gp_org_members').where({ org: org.id, user: userId }).first('notification_preferences');
	return JSON.parse(row.notification_preferences) as Record<string, { enabled: boolean; emailEnabled?: boolean }>;
};

test('Notifications are sent when preferences are null', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({ notification_preferences: null });
	await page.goto('/settings');

	await sendNotification('probe_adopted', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('probe_adopted').first()).toBeVisible();
	expect(await notificationEmailStatus(user.id, 'probe_adopted')).toBe('not-required');
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
	expect(await notificationEmailStatus(user.id, 'welcome')).toBe('not-required');
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
	expect(await notificationEmailStatus(user.id, 'outdated_firmware')).toBe('pending');
	await expect(page.getByText('welcome').first()).toBeVisible();
	expect(await notificationEmailStatus(user.id, 'welcome')).toBe('not-required');
	await expect(page.getByText('probe_adopted').first()).not.toBeVisible();
	await expect(page.getByText('offline_probe').first()).toBeVisible();
	expect(await notificationEmailStatus(user.id, 'offline_probe')).toBe('pending');
});

test('Toggles of notification types', async ({ page, user }) => {
	await client('directus_users').where({ id: user.id }).update({ notification_preferences: null });
	await page.goto('/settings');

	const probeAdoptedSection = page.getByText('New probe adopted').locator('..');
	// Disable probe adopted notifications.
	await probeAdoptedSection.getByRole('switch').first().click();
	const outdatedSoftwareSection = page.getByText('Probe container or firmware is outdated').locator('..');
	// Disable outdated software emails.
	await outdatedSoftwareSection.getByRole('switch').nth(1).click();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect.poll(async () => {
		const userData = await client('directus_users').where({ id: user.id }).select('notification_preferences').first();
		return JSON.parse(userData.notification_preferences)?.probe_adopted?.enabled;
	}).toBe(false);

	await sendNotification('probe_adopted', user.id);
	await sendNotification('probe_unassigned', user.id);
	await sendNotification('outdated_firmware', user.id);

	await page.reload();
	await page.getByRole('button', { name: 'Notifications' }).click();
	await expect(page.getByText('probe_adopted').first()).not.toBeVisible();
	await expect(page.getByText('probe_unassigned').first()).toBeVisible();
	await expect(page.getByText('outdated_firmware').first()).toBeVisible();
	expect(await notificationEmailStatus(user.id, 'probe_unassigned')).toBe('not-required');
	expect(await notificationEmailStatus(user.id, 'outdated_firmware')).toBe('disabled-by-user');
});

test('an account notification reaches every admin of the org and nobody else', async ({ org }) => {
	const secondAdmin = await generateUser('SecondAdmin');
	await client('gp_org_members').insert({ id: randomUUID(), org: org.id, user: secondAdmin.id, role: 'admin' });
	await client('directus_users').where({ id: secondAdmin.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });

	const message = `org notification ${randomUUID()}`;
	await sendAccountNotification('probe_adopted', org.account_id, message);

	// The member and the viewer are not notified about what the org owns.
	expect(await recipientsOf(message)).toEqual([ org.admin.id, secondAdmin.id ].sort());

	// The membership goes with the user.
	await clearUserData(secondAdmin);
});

test('an admin who has not selected the org does not get its notifications', async ({ org }) => {
	const secondAdmin = await generateUser('UnselectedAdmin');
	await client('gp_org_members').insert({ id: randomUUID(), org: org.id, user: secondAdmin.id, role: 'admin' });

	const message = `unselected admin ${randomUUID()}`;
	await sendAccountNotification('probe_adopted', org.account_id, message);

	expect(await recipientsOf(message)).toEqual([ org.admin.id ]);

	await clearUserData(secondAdmin);
});

test('an admin who disabled the type in the org does not get the notification', async ({ org }) => {
	const secondAdmin = await generateUser('MutedAdmin');

	await client('gp_org_members').insert({ id: randomUUID(), org: org.id, user: secondAdmin.id, role: 'admin' });
	await client('directus_users').where({ id: secondAdmin.id }).update({ selected_orgs: JSON.stringify([ org.id ]) });

	// Org preferences live on the membership, independent of the personal ones.
	await client('gp_org_members')
		.where({ org: org.id, user: secondAdmin.id })
		.update({ notification_preferences: JSON.stringify({ probe_adopted: { enabled: false } }) });

	const message = `muted admin ${randomUUID()}`;
	await sendAccountNotification('probe_adopted', org.account_id, message);

	expect(await recipientsOf(message)).toEqual([ org.admin.id ]);

	await clearUserData(secondAdmin);
});

test('unsubscribing from all emails mutes the org emails of the user too', async ({ org }) => {
	await client('gp_org_members')
		.where({ org: org.id, user: org.admin.id })
		.update({ notification_preferences: JSON.stringify({ outdated_software: { enabled: true, emailEnabled: true } }) });

	await unsubscribe(org.admin.id);

	const preferences = await membershipPreferences(org, org.admin.id);
	expect(Object.values(preferences).every(preference => preference.emailEnabled === false)).toBeTruthy();
	expect(preferences.outdated_software?.enabled).toBe(true);

	const message = `muted org email ${randomUUID()}`;
	await sendAccountNotification('outdated_firmware', org.account_id, message);

	// The admin still gets the in-app notification, only the email is off.
	expect(await recipientsOf(message)).toEqual([ org.admin.id ]);
	expect(await notificationEmailStatus(org.admin.id, 'outdated_firmware')).toBe('disabled-by-user');
});

test('unsubscribing from one type keeps the other org emails', async ({ org }) => {
	await unsubscribe(org.admin.id, 'outdated_software');

	const preferences = await membershipPreferences(org, org.admin.id);
	expect(preferences.outdated_software?.emailEnabled).toBe(false);
	expect(preferences.offline_probe?.emailEnabled).toBe(true);
});

test('a personal account notification reaches only its owner', async ({ user, org }) => {
	const message = `personal notification ${randomUUID()}`;
	await sendAccountNotification('probe_adopted', user.account_id, message);

	expect(await recipientsOf(message)).toEqual([ user.id ]);
	expect(await recipientsOf(message)).not.toContain(org.admin.id);
});

test('an org admin sets their own notification settings for the org, apart from the personal ones', async ({ browser, org }) => {
	await client('directus_users').where({ id: org.admin.id }).update({ notification_preferences: null });
	const page = await actAsOrg(browser, org, org.admin);
	await page.goto('/settings');

	// In the org it is acting as, the org settings are the ones shown first.
	await expect(page.getByLabel('Notifications account')).toContainText(org.name);
	await page.getByText('New probe adopted').locator('..').getByRole('switch').first().click();
	await page.getByRole('button', { name: 'Apply settings' }).click();

	await expect.poll(async () => (await membershipPreferences(org, org.admin.id))?.probe_adopted?.enabled).toBe(false);
	const personal = await client('directus_users').where({ id: org.admin.id }).first('notification_preferences');
	expect(JSON.parse(personal.notification_preferences).probe_adopted.enabled).toBe(true);

	await page.reload();
	await expect(page.getByText('New probe adopted').locator('..').getByRole('switch').first()).not.toBeChecked();

	await page.getByLabel('Notifications account').click();
	await page.locator('[data-pc-section=option]').filter({ hasText: '(personal)' }).click();
	await expect(page.getByText('New probe adopted').locator('..').getByRole('switch').first()).toBeChecked();
});

test('a member of an org has only the personal notification settings', async ({ browser, org }) => {
	const page = await pageAs(browser, org.member.email, 'user');
	await page.goto('/settings');

	await expect(page.getByText('New probe adopted')).toBeVisible();
	await expect(page.getByLabel('Notifications account')).toHaveCount(0);
});
