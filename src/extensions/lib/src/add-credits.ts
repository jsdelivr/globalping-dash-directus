import type { ApiExtensionContext } from '@directus/extensions';

export const SOURCE_ID_TO_TARGET_ID: Record<string, string> = {
	// For example:
	// 6191378: '1834071',
	66716858: '6209808',
};

type AddCreditsData = {
	github_id: string;
	amount: number;
	comment: string;
};

export const addCredits = async ({ github_id, amount, comment }: AddCreditsData, { services, database, getSchema, env }: ApiExtensionContext) => {
	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const githubId = redirectGithubId(github_id);
	const creditsId = await creditsAdditionsService.createOne({
		github_id: githubId,
		amount: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment,
	});
	return { creditsId, githubId };
};

export const redirectGithubId = (githubId: string) => {
	return SOURCE_ID_TO_TARGET_ID[githubId] || githubId;
};
