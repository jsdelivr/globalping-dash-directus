import type { SponsorsPeriodRange } from './types.js';

const FIRST_SPONSORSHIP_YEAR = 2024;

export const resolveSponsorsPeriod = (period: string, now = new Date()): SponsorsPeriodRange => {
	let from: Date;
	let to: Date;

	if (period === 'past-year') {
		from = new Date(now);
		from.setUTCFullYear(from.getUTCFullYear() - 1);
		to = new Date(now);
	} else {
		const year = Number(period);

		if (!/^\d{4}$/.test(period) || year < FIRST_SPONSORSHIP_YEAR || year > now.getUTCFullYear()) {
			throw new Error('Invalid sponsors period.');
		}

		from = new Date(Date.UTC(year, 0, 1));
		to = new Date(Date.UTC(year + 1, 0, 1));
	}

	const monthKeys: string[] = [];
	const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));

	while (cursor < to) {
		monthKeys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}

	return { from, to, monthKeys };
};
