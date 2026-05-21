import type { OperationContext } from '@directus/extensions';
import { LOW_CREDITS_DEFAULT_THRESHOLD } from '../../../../lib/src/notification-types.js';

type CreditsRow = {
	id: number;
	user_id: string;
	amount: number;
	low_credits_notified: boolean;
};

type LowCreditsPref = {
	enabled?: boolean;
	parameter?: number;
};

type User = {
	id: string;
	notification_preferences: Record<string, LowCreditsPref> | null;
};

export const checkLowCredits = async (ctx: OperationContext): Promise<{ notified: string[]; reset: string[] }> => {
	const { disabledUserIds, customThresholds } = await getUsersWithCustomPreferences(ctx);
	const { toNotify, toReset } = await findCandidates(ctx, disabledUserIds, customThresholds);
	const flippedIds = await flipFlags(ctx, toNotify, toReset);
	const filteredToNotify = toNotify.filter(r => flippedIds.has(r.id));
	await sendNotifications(ctx, filteredToNotify);

	return {
		notified: filteredToNotify.map(r => r.user_id),
		reset: toReset.map(r => r.user_id),
	};
};

const getUsersWithCustomPreferences = async (ctx: OperationContext) => {
	const { ItemsService } = ctx.services;
	const usersService = new ItemsService('directus_users', { schema: await ctx.getSchema() });

	const prefsRows = await usersService.readByQuery({
		filter: { notification_preferences: { _nnull: true } },
		fields: [ 'id', 'notification_preferences' ],
	}) as User[];

	const disabledUserIds = new Set<string>();
	const customThresholds = new Map<string, number>();

	for (const row of prefsRows) {
		const lowCredits = row.notification_preferences?.low_credits;

		if (!lowCredits) { continue; }

		if (lowCredits.enabled === false) {
			disabledUserIds.add(row.id);
		} else if (typeof lowCredits.parameter === 'number' && lowCredits.parameter !== LOW_CREDITS_DEFAULT_THRESHOLD) {
			customThresholds.set(row.id, lowCredits.parameter);
		}
	}

	return { disabledUserIds, customThresholds };
};

const findCandidates = async (
	ctx: OperationContext,
	disabledUserIds: Set<string>,
	customThresholds: Map<string, number>,
): Promise<{ toNotify: CreditsRow[]; toReset: CreditsRow[] }> => {
	const { ItemsService } = ctx.services;
	const creditsService = new ItemsService('gp_credits', { schema: await ctx.getSchema() });

	const specialUserIds = [ ...disabledUserIds, ...customThresholds.keys() ];
	const fields = [ 'id', 'user_id', 'amount', 'low_credits_notified' ];

	const [ notifyCandidates, resetCandidates, customRows ] = await Promise.all([
		creditsService.readByQuery({
			filter: {
				_and: [
					{ low_credits_notified: { _eq: false } },
					{ amount: { _lte: LOW_CREDITS_DEFAULT_THRESHOLD } },
					{ user_id: { _nin: specialUserIds } },
					{ user_id: { id: { _nnull: true } } },
				],
			},
			fields,
		}) as Promise<CreditsRow[]>,
		creditsService.readByQuery({
			filter: {
				_and: [
					{ low_credits_notified: { _eq: true } },
					{ amount: { _gt: LOW_CREDITS_DEFAULT_THRESHOLD } },
					{ user_id: { _nin: specialUserIds } },
				],
			},
			fields,
		}) as Promise<CreditsRow[]>,
		customThresholds.size > 0
			? creditsService.readByQuery({
				filter: { user_id: { _in: [ ...customThresholds.keys() ] } },
				fields,
			}) as Promise<CreditsRow[]>
			: Promise.resolve([] as CreditsRow[]),
	]);

	const toNotify: CreditsRow[] = [ ...notifyCandidates ];
	const toReset: CreditsRow[] = [ ...resetCandidates ];

	for (const row of customRows) {
		const threshold = customThresholds.get(row.user_id)!;

		if (!row.low_credits_notified && row.amount <= threshold) {
			toNotify.push(row);
		} else if (row.low_credits_notified && row.amount > threshold) {
			toReset.push(row);
		}
	}

	return { toNotify, toReset };
};

const sendNotifications = async (ctx: OperationContext, toNotify: CreditsRow[]): Promise<void> => {
	if (toNotify.length === 0) { return; }

	const { NotificationsService } = ctx.services;
	const notificationsService = new NotificationsService({
		schema: await ctx.getSchema(),
	});

	await notificationsService.createMany(toNotify.map(row => ({
		recipient: row.user_id,
		type: 'low_credits',
		subject: 'Your Globalping credits are running low',
		message: `You have ${row.amount} credits remaining, which may run out soon. You can host more probes or become a [sponsor](https://github.com/sponsors/jsdelivr) to get more credits.`,
	})));
};

const flipFlags = async (ctx: OperationContext, toNotify: CreditsRow[], toReset: CreditsRow[]): Promise<Set<number>> => {
	const { ItemsService } = ctx.services;
	const creditsService = new ItemsService('gp_credits', { schema: await ctx.getSchema() });

	const [ flippedIds ] = await Promise.all([
		toNotify.length > 0
			? creditsService.updateByQuery({
				filter: {
					_and: [
						{ id: { _in: toNotify.map(r => r.id) } },
						{ low_credits_notified: { _eq: false } },
					],
				},
			}, { low_credits_notified: true }) as Promise<number[]>
			: Promise.resolve([] as number[]),
		toReset.length > 0
			? creditsService.updateByQuery({
				filter: {
					_and: [
						{ id: { _in: toReset.map(r => r.id) } },
						{ low_credits_notified: { _eq: true } },
					],
				},
			}, { low_credits_notified: false }) as Promise<number[]>
			: Promise.resolve([] as number[]),
	]);

	return new Set(flippedIds);
};
