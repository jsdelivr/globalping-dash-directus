import type { OperationContext } from '@directus/extensions';
import { getCandidates, notifyRecipients, saveNotifiedList } from '../repositories/directus.js';
import type { NotifiedListUpdate, CandidateRow } from '../types.js';

export const checkLowCredits = async (ctx: OperationContext): Promise<{ notified: string[]; reset: string[] }> => {
	const candidates = await getCandidates(ctx);
	const { toNotify, updates } = getUpdates(candidates);

	await saveNotifiedList(ctx, updates);
	await notifyRecipients(ctx, toNotify);

	return {
		notified: toNotify.map(row => row.recipient),
		reset: updates.filter(update => update.recipients.length === 0).map(update => String(update.id)),
	};
};

// A recipient is added to the low_credits_notified list on low balance, and removed as soon as the balance is above their own
// threshold again, so a later drop notifies them again.
const getUpdates = (candidates: CandidateRow[]): { toNotify: CandidateRow[]; updates: NotifiedListUpdate[] } => {
	const toNotify: CandidateRow[] = [];
	const recipientsByAccount = new Map<number, { row: CandidateRow; recipients: string[] }>();

	for (const candidate of candidates) {
		const entry = recipientsByAccount.get(candidate.id) ?? { row: candidate, recipients: [] };
		recipientsByAccount.set(candidate.id, entry);

		const isNotified = candidate.allNotifiedUsers.includes(candidate.recipient);

		// The balance is above their threshold: the episode is over for them, so they leave the list.
		if (candidate.amount > candidate.threshold) {
			continue;
		}

		// They are already on the list: they stay in the list.
		if (isNotified) {
			entry.recipients.push(candidate.recipient);
			continue;
		}

		// They turned the notification off: nothing to send, and nothing to remember.
		if (!candidate.enabled) {
			continue;
		}

		// The balance is low and they haven't been notified in this episode yet.
		toNotify.push(candidate);
		entry.recipients.push(candidate.recipient);
	}

	const updates = [ ...recipientsByAccount.values() ]
		.filter(({ row, recipients }) => !isSameList(row.allNotifiedUsers, recipients))
		.map(({ row, recipients }) => ({ id: row.id, recipients }));

	return { toNotify, updates };
};

const isSameList = (a: string[], b: string[]) => a.length === b.length && a.every(item => b.includes(item));
