import type { OperationContext } from '@directus/extensions';
import { LOW_CREDITS_DEFAULT_THRESHOLD } from '../../../../lib/src/notification-types.js';
import { sendNotification } from '../../../../lib/src/send-notification.js';
import type { NotifiedListUpdate, CandidateRow } from '../types.js';

// The threshold and the switch come from the recipient's own preferences: the personal ones for a user account, the per-org ones
// for an org member. An org balance produces a row per admin.
export const getCandidates = async ({ database }: OperationContext): Promise<CandidateRow[]> => {
	const rows = (await database.raw(`
		SELECT
			c.id,
			c.account_id,
			c.amount,
			c.low_credits_notified AS allNotifiedUsers,
			COALESCE(u.id, m.user) AS recipient,
			COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(u.notification_preferences, m.notification_preferences), '$.low_credits.parameter')) AS UNSIGNED), ?) AS threshold,
			COALESCE(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(u.notification_preferences, m.notification_preferences), '$.low_credits.enabled')), 'true') != 'false' AS enabled
		FROM gp_credits c
		JOIN gp_accounts a ON a.id = c.account_id
		LEFT JOIN directus_users u ON u.id = a.user
		LEFT JOIN gp_org_members m ON m.org = a.org AND m.role = 'admin'
		HAVING recipient IS NOT NULL AND (amount <= threshold OR JSON_LENGTH(allNotifiedUsers) > 0)
	`, [ LOW_CREDITS_DEFAULT_THRESHOLD ]))[0] as (Omit<CandidateRow, 'allNotifiedUsers' | 'enabled'> & { allNotifiedUsers: string; enabled: number })[];

	return rows.map(row => ({ ...row, allNotifiedUsers: JSON.parse(row.allNotifiedUsers) as string[], enabled: Boolean(row.enabled) }));
};

export const notifyRecipients = async (context: OperationContext, toNotify: CandidateRow[]): Promise<void> => {
	const { logger } = context;
	const errors: unknown[] = [];

	for (const row of toNotify) {
		try {
			await sendNotification({
				account: row.account_id,
				recipient: row.recipient,
				type: 'low_credits',
				subject: 'Your Globalping credits are running low',
				message: `You have ${row.amount} credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.`,
			}, context);
		} catch (error) {
			logger.error(error);
			errors.push(error);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors, `Failed to notify ${errors.length} of ${toNotify.length} recipients.`);
	}
};

export const saveNotifiedList = async ({ database, services, getSchema }: OperationContext, updates: NotifiedListUpdate[]): Promise<void> => {
	if (updates.length === 0) { return; }

	const { ItemsService } = services;
	const schema = await getSchema();

	await database.transaction(async (trx) => {
		const creditsService = new ItemsService('gp_credits', { schema, knex: trx });

		for (const { id, recipients } of updates) {
			await creditsService.updateOne(id, { low_credits_notified: recipients });
		}
	});
};
