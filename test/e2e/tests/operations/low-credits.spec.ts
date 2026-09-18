import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { FLOW, trigger } from './shared.ts';
import { User } from '../../types.ts';

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

	await trigger(FLOW.lowCredits);
	await trigger(FLOW.lowCredits);

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

	await trigger(FLOW.lowCredits);

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

	await trigger(FLOW.lowCredits);
	await trigger(FLOW.lowCredits);

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

	await trigger(FLOW.lowCredits);

	const notification = await sql('directus_notifications')
		.where({ recipient: user.id, type: 'low_credits' })
		.first();
	expect(notification).toBeUndefined();

	expect(await getNotifiedUsers(user)).toEqual([]);
});

test('resets the flag while disabled, then notifies again after re-enabling', async ({ user }) => {
	await addCredits(user, 100);

	await trigger(FLOW.lowCredits);

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
	await trigger(FLOW.lowCredits);

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

	await trigger(FLOW.lowCredits);

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

test('notifies an org admin by their org preferences, whatever their personal ones say', async ({ org }) => {
	// The admin muted the type for themselves and left it on in the org; the member did the opposite.
	await sql('directus_users').whereIn('id', [ org.admin.id, org.member.id ]).update({
		notification_preferences: JSON.stringify({ low_credits: { enabled: false } }),
	});

	await sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({
		notification_preferences: JSON.stringify({ low_credits: { enabled: true, parameter: 8000 } }),
	});

	await sql('gp_credits').insert({
		account_id: org.account_id,
		amount: 4000,
		low_credits_notified: JSON.stringify([]),
	});

	await trigger(FLOW.lowCredits);

	const notifications = await sql('directus_notifications')
		.whereIn('recipient', [ org.admin.id, org.member.id, org.viewer.id ])
		.where({ type: 'low_credits' })
		.select('recipient');

	expect(notifications.map(notification => notification.recipient)).toEqual([ org.admin.id ]);

	const credits = await sql('gp_credits').where({ account_id: org.account_id }).select('low_credits_notified').first();
	expect(JSON.parse(credits.low_credits_notified)).toEqual([ org.admin.id ]);
});

const addOrgCredits = async (accountId: string, amount: number, notifiedUsers: string[] = []) => {
	await sql('gp_credits').insert({ account_id: accountId, amount, low_credits_notified: JSON.stringify(notifiedUsers) });
};

const getOrgNotifiedUsers = async (accountId: string) => {
	const credits = await sql('gp_credits').where({ account_id: accountId }).select('low_credits_notified').first();
	return JSON.parse(credits.low_credits_notified) as string[];
};

const promoteToAdmin = async (org: { id: string; member: User }) => {
	await sql('gp_org_members').where({ org: org.id, user: org.member.id }).update({ role: 'admin' });
	return org.member;
};

const notifiedRecipients = async (org: { admin: User; member: User; viewer: User }) => {
	const rows = await sql('directus_notifications')
		.whereIn('recipient', [ org.admin.id, org.member.id, org.viewer.id ])
		.where({ type: 'low_credits' })
		.select('recipient');

	return rows.map(row => row.recipient as string).sort();
};

test('notifies every admin of the org, and nobody below that role', async ({ org }) => {
	// The fixture builds an org with a single admin, so the member is promoted to give it a second one.
	const secondAdmin = await promoteToAdmin(org);
	await addOrgCredits(org.account_id, 100);

	await trigger(FLOW.lowCredits);

	// One balance, one notification per admin; the viewer stays out of it.
	expect(await notifiedRecipients(org)).toEqual([ org.admin.id, secondAdmin.id ].sort());
	expect((await getOrgNotifiedUsers(org.account_id)).sort()).toEqual([ org.admin.id, secondAdmin.id ].sort());
});

test('leaves out the admin who turned the notification off in the org, and keeps the other', async ({ org }) => {
	const secondAdmin = await promoteToAdmin(org);

	await sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({
		notification_preferences: JSON.stringify({ low_credits: { enabled: false } }),
	});

	await addOrgCredits(org.account_id, 100);

	await trigger(FLOW.lowCredits);

	expect(await notifiedRecipients(org)).toEqual([ secondAdmin.id ]);

	// The one who is not being told is not remembered either, so turning it back on notifies them.
	expect(await getOrgNotifiedUsers(org.account_id)).toEqual([ secondAdmin.id ]);
});

test('clears every admin from the list once the org balance recovers', async ({ org }) => {
	const secondAdmin = await promoteToAdmin(org);
	await addOrgCredits(org.account_id, 100, [ org.admin.id, secondAdmin.id ]);

	await sql('gp_credits').where({ account_id: org.account_id }).update({ amount: 100000 });
	await trigger(FLOW.lowCredits);

	expect(await getOrgNotifiedUsers(org.account_id)).toEqual([]);
	expect(await notifiedRecipients(org)).toEqual([]);
});

test('notifies the admin who turns the notification back on, and does not repeat it for the other', async ({ org }) => {
	const secondAdmin = await promoteToAdmin(org);

	await sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({
		notification_preferences: JSON.stringify({ low_credits: { enabled: false } }),
	});

	await addOrgCredits(org.account_id, 100);
	await trigger(FLOW.lowCredits);

	expect(await notifiedRecipients(org)).toEqual([ secondAdmin.id ]);

	await sql('gp_org_members').where({ org: org.id, user: org.admin.id }).update({
		notification_preferences: JSON.stringify({ low_credits: { enabled: true } }),
	});

	await trigger(FLOW.lowCredits);

	// The list holds the admins already told, not the balance itself, so the same low balance still reaches a new one.
	expect(await notifiedRecipients(org)).toEqual([ org.admin.id, secondAdmin.id ].sort());
	expect((await getOrgNotifiedUsers(org.account_id)).sort()).toEqual([ org.admin.id, secondAdmin.id ].sort());

	const perAdmin = await sql('directus_notifications')
		.whereIn('recipient', [ org.admin.id, secondAdmin.id ])
		.where({ type: 'low_credits' })
		.count({ count: '*' })
		.groupBy('recipient')
		.select('recipient');

	// One each: the second run must not tell the first admin a second time.
	expect(perAdmin.map(row => row.count)).toEqual([ 1, 1 ]);
});

