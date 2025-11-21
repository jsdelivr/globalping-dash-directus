import type { OperationContext } from '@directus/extensions';
import { addCredits } from '../../../lib/src/add-credits.js';

export const getFullMonthsSince = (date: Date): number => {
	const inputDate = new Date(date);
	const currentDate = new Date();

	const timeDifference = currentDate.getTime() - inputDate.getTime();
	const daysDifference = timeDifference / (1000 * 60 * 60 * 24);

	return Math.floor(daysDifference / 30);
};

type AwardRecurringCreditsParams = {
	githubId: string;
	monthlyAmount: number;
	monthsToAward: number;
};

export const awardRecurringCredits = async (
	{ githubId, monthlyAmount, monthsToAward }: AwardRecurringCreditsParams,
	context: OperationContext,
) => {
	const totalAmount = monthlyAmount * monthsToAward;

	const { creditsId } = await addCredits({
		github_id: githubId,
		amount: totalAmount,
		reason: 'recurring_sponsorship',
		meta: { amountInDollars: totalAmount, monthsCovered: monthsToAward },
	}, context);

	return { creditsId, totalAmount };
};
