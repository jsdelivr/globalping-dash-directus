import type { ApiExtensionContext } from '@directus/extensions';

export const SOURCE_ID_TO_TARGET_ID: Record<string, string> = {
	// For example:
	// 6191378: '1834071',
	66716858: '6209808',
	203478287: '163146',
};

type CreditsAddition = {
	meta: { amountInDollars?: number };
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
			date_created: { _gte: `$NOW(-1 year)` },
		},
	}) as CreditsAddition[];
	console.log('additionsInLastYear', additionsInLastYear);

	const dollarsInLastYear = additionsInLastYear.reduce((sum, { meta }) => sum + (meta.amountInDollars ?? 0), 0);
	const calculatedBonus = Math.floor((dollarsInLastYear + incomingAmountInDollars) / 100) * parseInt(env.CREDITS_BONUS_PER_100_DOLLARS, 10);
	const bonus = calculatedBonus <= maxCreditsBonus ? calculatedBonus : maxCreditsBonus;

	return { bonus, dollarsInLastYear };
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
		meta,
	});
	return { creditsId, githubId };
};

export const redirectGithubId = (githubId: string) => {
	return SOURCE_ID_TO_TARGET_ID[githubId] || githubId;
};
