import type { ApiExtensionContext } from '@directus/extensions';

export const SOURCE_ID_TO_TARGET_ID: Record<string, string> = {
	// For example:
	// 6191378: '1834071',
	66716858: '6209808',
	203478287: '163146',
	21207279: '219827779',
};

type CreditsAddition = {
	meta: { amountInDollars?: number };
	date_created: string;
};

type AddCreditsData = {
	github_id: string;
	amount: number;
	reason: 'recurring_sponsorship' | 'one_time_sponsorship' | 'tier_changed';
	meta: { amountInDollars: number };
};

export const getUserBonus = async (githubId: string | null, incomingAmountInDollars: number, { services, database, getSchema, env }: ApiExtensionContext) => {
	const { ItemsService } = services;

	if (!env.CREDITS_BONUS_PER_100_DOLLARS || !env.MAX_CREDITS_BONUS) {
		throw new Error('CREDITS_BONUS_PER_100_DOLLARS or MAX_CREDITS_BONUS was not provided');
	}

	const maxCreditsBonus = parseInt(env.MAX_CREDITS_BONUS, 10);

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const additionsInLastYear = await creditsAdditionsService.readByQuery({
		filter: {
			github_id: { _eq: githubId },
			reason: { _in: [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ] },
			date_created: { _gte: new Date(Date.now() - 367 * 24 * 60 * 60 * 1000) },
		},
		sort: [ 'date_created' ], // Additions should be sorted for getDollarsByMonth().
		fields: [ 'meta', 'date_created' ],
	}) as CreditsAddition[];

	const dollarsByMonth = getDollarsByMonth(additionsInLastYear);
	const dollarsInLastYear = additionsInLastYear.reduce((sum, { meta }) => sum + (meta.amountInDollars ?? 0), 0);
	const calculatedBonus = Math.floor((dollarsInLastYear + incomingAmountInDollars) / 100) * parseInt(env.CREDITS_BONUS_PER_100_DOLLARS, 10);
	const bonus = calculatedBonus <= maxCreditsBonus ? calculatedBonus : maxCreditsBonus;

	return { bonus, dollarsInLastYear, dollarsByMonth };
};

export const addCredits = async ({ github_id, amount, reason, meta }: AddCreditsData, context: ApiExtensionContext) => {
	const { services, database, getSchema, env } = context;
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const githubId = redirectGithubId(github_id);
	const { bonus } = await getUserBonus(githubId, amount, context);
	const creditsId = await creditsAdditionsService.createOne({
		github_id: githubId,
		amount: Math.floor(amount * parseInt(env.CREDITS_PER_DOLLAR, 10) * (100 + bonus) / 100),
		reason,
		meta: { ...meta, bonus },
	});
	return { creditsId, githubId };
};

export const redirectGithubId = (githubId: string) => {
	return SOURCE_ID_TO_TARGET_ID[githubId] || githubId;
};

const getPrevious12Dates = () => {
	const dates: Date[] = [];
	const date = new Date();
	const startDay = date.getDate();
	dates.push(new Date(date));

	for (let i = 0; i < 11; i++) {
		date.setDate(1);
		date.setMonth(date.getMonth() - 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
		date.setDate(Math.min(startDay, lastDay));
		dates.push(new Date(date));
	}

	return dates.reverse();
};

const getDollarsByMonth = (additions: CreditsAddition[]) => {
	const breakdown: number[] = [];
	const previous12Dates = getPrevious12Dates();
	let additionIndex = 0;

	for (const date of previous12Dates) {
		let currentSum = 0;

		while (additions[additionIndex] && new Date(additions[additionIndex]!.date_created) <= date) {
			currentSum += additions[additionIndex]!.meta.amountInDollars ?? 0;
			additionIndex++;
		}

		breakdown.push(currentSum);
	}

	return breakdown;
};
