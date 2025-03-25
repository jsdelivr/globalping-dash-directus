import type { ApiExtensionContext } from '@directus/extensions';

const SOURCE_ID_TO_TARGET_ID: Record<string, string> = {
	// For example:
	// 6191378: '1834071',
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

	const result = await creditsAdditionsService.createOne({
		github_id: redirectGithubId(github_id),
		amount: amount * parseInt(env.CREDITS_PER_DOLLAR, 10),
		comment,
	});
	return result;
};

export const redirectGithubId = (githubId: string) => {
	return SOURCE_ID_TO_TARGET_ID[githubId] || githubId;
};
