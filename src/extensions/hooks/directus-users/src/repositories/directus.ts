import type { HookExtensionContext } from '@directus/extensions';
import type { Accountability } from '@directus/types';

export type DirectusUser = {
	id: string;
	external_identifier: string;
	github_username: string;
	github_organizations: string[];
	default_prefix: string | null;
	deprecated_prefix: string | null;
	github_oauth_token: string | null;
};

export const getDirectusUsers = async (userIds: string[], accountability: Accountability | null, { services, getSchema }: HookExtensionContext): Promise<DirectusUser[]> => {
	const { ItemsService } = services;

	const usersService = new ItemsService('directus_users', {
		schema: await getSchema(),
		accountability,
	});

	const users = await usersService.readByQuery({
		filter: {
			id: { _in: userIds },
		},
	}) as DirectusUser[];
	return users;
};

export const clearDeprecatedPrefix = async (userIds: string[], { services, getSchema }: HookExtensionContext) => {
	const { UsersService } = services;
	const usersService = new UsersService({ schema: await getSchema() });

	await usersService.updateByQuery({
		filter: {
			id: { _in: userIds },
			deprecated_prefix: { _nnull: true },
		},
	}, { deprecated_prefix: null });
};

export const deleteCreditsAdditions = async (githubIds: string[], accountability: Accountability | null, { services, getSchema }: HookExtensionContext) => {
	if (githubIds.length === 0) {
		return;
	}

	const { ItemsService } = services;
	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema(),
		accountability,
	});

	await creditsAdditionsService.deleteByQuery({ filter: { github_id: { _in: githubIds } } });
};
