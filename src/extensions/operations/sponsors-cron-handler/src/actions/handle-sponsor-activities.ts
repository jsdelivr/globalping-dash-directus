import type { OperationContext } from '@directus/extensions';
import { addCredits, redirectGithubId } from '../../../../lib/src/add-credits.js';
import { createDirectusSponsor, getRecentCreditsAdditions, sponsorExists } from '../repositories/directus.js';
import { getGithubSponsorActivities } from '../repositories/github-activities.js';
import type { CreditsAddition, GithubActivity, GithubSponsor, NewSponsorshipActivity } from '../types.js';

const ONE_DAY = 24 * 60 * 60 * 1000;
const TEN_MINS = 10 * 60 * 1000;

type Reason = 'one_time_sponsorship' | 'recurring_sponsorship' | 'tier_changed';

export class SponsorActivitiesHandler {
	lastWindowEnd: number | null = null;

	async handle (context: OperationContext): Promise<string[]> {
		const now = new Date();
		const defaultWindowStart = now.getTime() - ONE_DAY;
		const windowStart = (this.lastWindowEnd ?? defaultWindowStart) - TEN_MINS; // Overlap with prev window to handle activities created after windowEnd but which timestamp is before windowEnd.
		const windowEnd = now.getTime() - TEN_MINS; // Do not handle activities created in the last 10 minutes, so webhook has time to process them.

		const activities = await getGithubSponsorActivities(windowStart, windowEnd, context);
		const additions = await getRecentCreditsAdditions(windowStart - TEN_MINS, context); // Look up additions slightly before windowStart to catch matches whose date_created falls just before the window.

		const { remainingActivities, remainingAdditions } = this.matchByTierId(activities, additions);
		const activitiesWithoutAddition = this.matchByDate(remainingActivities, remainingAdditions);

		const results = await Promise.all(activitiesWithoutAddition.map(a => this.createAddition(a, context)));

		this.lastWindowEnd = windowEnd;
		return results.filter((r): r is string => r !== null);
	}

	private matchByTierId (
		activities: GithubActivity[],
		additions: CreditsAddition[],
	): { remainingActivities: GithubActivity[]; remainingAdditions: CreditsAddition[] } {
		const remainingAdditions = [ ...additions ];

		const remainingActivities = activities.filter((activity) => {
			const githubId = this.getGithubId(activity);
			const reason = this.getReason(activity);
			const tierId = activity.sponsorsTier.id;

			const idx = remainingAdditions.findIndex(a => a.github_id === githubId
				&& a.reason === reason
				&& a.meta.tierId === tierId);

			if (idx < 0) {
				return true;
			}

			remainingAdditions.splice(idx, 1);
			return false;
		});

		return { remainingActivities, remainingAdditions };
	}

	private matchByDate (activities: GithubActivity[], additions: CreditsAddition[]): GithubActivity[] {
		const DATE_MATCH_TOLERANCE = 60 * 1000; // If can't match by tier id, try to match by date ±60 seconds.
		const remainingAdditions = [ ...additions ];

		return activities.filter((activity) => {
			const githubId = this.getGithubId(activity);
			const amount = this.amountInDollars(activity);
			const activityTime = new Date(activity.timestamp).getTime();

			const idx = remainingAdditions.findIndex((a) => {
				if (a.github_id !== githubId) { return false; }

				if (a.meta.amountInDollars !== amount) { return false; }

				const createdTime = new Date(a.date_created).getTime();
				return Math.abs(createdTime - activityTime) <= DATE_MATCH_TOLERANCE;
			});

			if (idx < 0) {
				return true;
			}

			remainingAdditions.splice(idx, 1);
			return false;
		});
	}

	private async createAddition (activity: GithubActivity, context: OperationContext): Promise<string | null> {
		const githubId = this.getGithubId(activity);

		if (activity.action === 'NEW_SPONSORSHIP' && !activity.sponsorsTier.isOneTime) {
			return this.createRecurringSponsor(activity, githubId, context);
		}

		const reason = this.getReason(activity);
		const amount = this.amountInDollars(activity);
		const tierId = activity.sponsorsTier.id;

		await addCredits({
			github_id: githubId,
			amount,
			reason,
			meta: { amountInDollars: amount, tierId },
		}, context);

		return `Activity ${activity.id}: ${reason === 'one_time_sponsorship' ? 'one-time sponsorship' : 'tier change'} credits added for github_id ${githubId}`;
	}

	private async createRecurringSponsor (
		activity: NewSponsorshipActivity,
		githubId: string,
		context: OperationContext,
	): Promise<string | null> {
		if (await sponsorExists(githubId, context)) {
			return null;
		}

		const { id: tierId, monthlyPriceInDollars: monthlyAmount } = activity.sponsorsTier;

		const githubSponsor: GithubSponsor = {
			githubId,
			githubLogin: activity.sponsor.login,
			tierId,
			isActive: true,
			monthlyAmount,
			isOneTimePayment: false,
			tierSelectedAt: new Date(activity.timestamp),
		};

		await createDirectusSponsor(githubSponsor, new Date(activity.timestamp), context);

		await addCredits({
			github_id: githubId,
			amount: monthlyAmount,
			reason: 'recurring_sponsorship',
			meta: { amountInDollars: monthlyAmount, monthsCovered: 1, tierId },
		}, context);

		return `Activity ${activity.id}: recurring sponsorship credits added for github_id ${githubId}`;
	}

	private getGithubId (activity: GithubActivity): string {
		return redirectGithubId(String(activity.sponsor.databaseId));
	}

	private getReason (activity: GithubActivity): Reason {
		if (activity.action === 'TIER_CHANGE') {
			return 'tier_changed';
		}

		return activity.sponsorsTier.isOneTime ? 'one_time_sponsorship' : 'recurring_sponsorship';
	}

	private amountInDollars (activity: GithubActivity): number {
		if (activity.action === 'TIER_CHANGE') {
			return activity.sponsorsTier.monthlyPriceInDollars - activity.previousSponsorsTier.monthlyPriceInDollars;
		}

		return activity.sponsorsTier.monthlyPriceInDollars;
	}
}

export const sponsorActivitiesHandler = new SponsorActivitiesHandler();
