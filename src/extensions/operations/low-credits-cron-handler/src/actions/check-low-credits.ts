import type { OperationContext } from '@directus/extensions';
import { LOW_CREDITS_DEFAULT_THRESHOLD } from '../../../../lib/src/notification-types.js';

type CreditsRow = {
	id: number;
	user_id: string;
	amount: number;
	low_credits_notified: boolean;
};

export const checkLowCredits = async (ctx: OperationContext): Promise<{ notified: string[]; reset: string[] }> => {
	const { toNotify, toReset } = await findCreditsToUpdate(ctx);
	const notified = await notifyAndFlipFlags(ctx, toNotify);
	await resetFlags(ctx, toReset);

	return { notified, reset: toReset.map(r => r.user_id) };
};

const findCreditsToUpdate = async (ctx: OperationContext): Promise<{ toNotify: CreditsRow[]; toReset: CreditsRow[] }> => {
	const rows = (await ctx.database.raw(`
		SELECT id, user_id, amount, low_credits_notified
		FROM (
			SELECT
				c.id,
				c.user_id,
				c.amount,
				c.low_credits_notified,
				COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(u.notification_preferences, '$.low_credits.parameter')) AS UNSIGNED), ?) AS threshold,
				COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.notification_preferences, '$.low_credits.enabled')), 'true') AS low_credits_enabled
			FROM gp_credits c
			JOIN directus_users u ON u.id = c.user_id
		) candidates
		WHERE low_credits_enabled != 'false'
			AND (
				(low_credits_notified = false AND amount <= threshold)
				OR (low_credits_notified = true AND amount > threshold)
			)
	`, [ LOW_CREDITS_DEFAULT_THRESHOLD ]))[0] as CreditsRow[];

	return {
		toNotify: rows.filter(r => !r.low_credits_notified),
		toReset: rows.filter(r => r.low_credits_notified),
	};
};

const notifyAndFlipFlags = async (ctx: OperationContext, toNotify: CreditsRow[]): Promise<string[]> => {
	if (toNotify.length === 0) { return []; }

	const { database, services, getSchema } = ctx;
	const schema = await getSchema();

	return database.transaction(async (trx) => {
		const { NotificationsService, ItemsService } = services;
		const creditsService = new ItemsService('gp_credits', { schema, knex: trx });
		const notificationsService = new NotificationsService({ schema, knex: trx });

		const flippedIds = await creditsService.updateByQuery({
			filter: {
				_and: [
					{ id: { _in: toNotify.map(r => r.id) } },
					{ low_credits_notified: { _eq: false } },
				],
			},
		}, { low_credits_notified: true }) as number[];

		if (flippedIds.length === 0) { return []; }

		const flippedSet = new Set(flippedIds);
		const updated = toNotify.filter(r => flippedSet.has(r.id));

		await notificationsService.createMany(updated.map(row => ({
			recipient: row.user_id,
			type: 'low_credits',
			subject: 'Your Globalping credits are running low',
			message: `You have ${row.amount} credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.`,
		})));

		return updated.map(r => r.user_id);
	});
};

const resetFlags = async (ctx: OperationContext, toReset: CreditsRow[]): Promise<void> => {
	if (toReset.length === 0) { return; }

	const { ItemsService } = ctx.services;
	const creditsService = new ItemsService('gp_credits', { schema: await ctx.getSchema() });
	await creditsService.updateMany(toReset.map(r => r.id), { low_credits_notified: false });
};
