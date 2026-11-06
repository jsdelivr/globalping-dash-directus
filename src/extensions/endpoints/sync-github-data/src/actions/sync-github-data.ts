import { createError } from '@directus/errors';
import type { EndpointExtensionContext } from '@directus/extensions';
import { checkDefaultPrefix } from '../../../../lib/src/deprecate-prefix.js';
import { getGithubOrganizations, getGithubUsername } from '../../../../lib/src/github-api-client.js';
import { syncOrganizations } from '../../../../lib/src/sync-orgs.js';
import { getDirectusUser, updateDirectusUser } from '../repositories/directus.js';

export type User = {
	id: string;
	external_identifier: string | null;
	github_username: string | null;
	github_oauth_token: string | null;
	default_prefix: string | null;
	deprecated_prefix: string | null;
	public_probes: boolean;
};

const NotEnoughDataError = createError('INVALID_PAYLOAD_ERROR', 'Not enough data to sync with GitHub', 400);

export const syncGithubData = async (userId: string, context: EndpointExtensionContext) => {
	const user = await getDirectusUser(userId, context);

	if (!user.external_identifier) {
		throw new NotEnoughDataError();
	}

	const [ githubUsername, organizations ] = await Promise.all([
		getGithubUsername(user, context),
		getGithubOrganizations(user, context),
	]);

	await syncOrganizations(user, organizations, context);

	if (user.github_username !== githubUsername) {
		await updateDirectusUser(user, { github_username: githubUsername }, context);
		user.github_username = githubUsername;
	}

	await checkDefaultPrefix(user, context);

	return {
		github_username: githubUsername,
	};
};
