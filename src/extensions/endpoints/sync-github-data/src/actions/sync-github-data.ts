import _ from 'lodash';
import { EndpointExtensionContext } from '@directus/extensions';
import { createError } from '@directus/errors';
import { Request } from '../index';
import { getDirectusUser, updateDirectusUser } from '../repositories/directus.js';
import { getGithubOrgs, getGithubUsername } from '../repositories/github.js';

export type User = {
	id: string;
	external_identifier: string | null;
	github_username: string | null;
	github_organizations: string[];
};

const NotEnoughDataError = createError('INVALID_PAYLOAD_ERROR', 'Not enough data to sync with GitHub', 400);

export const syncGithubData = async (userId: string, accountability: Request['accountability'], context: EndpointExtensionContext) => {
	const user = await getDirectusUser(userId, accountability, context);
	const githubId = user?.external_identifier;
	const username = user?.github_username;

	if (!user || !githubId) {
		throw new NotEnoughDataError();
	}

	const [ githubUsername, githubOrgs ] = await Promise.all([
		getGithubUsername(user, context),
		getGithubOrgs(user, context),
	]);

	if (username !== githubUsername || !_.isEqual(user.github_organizations.sort(), githubOrgs.sort())) {
		await updateDirectusUser(user, {
			github_username: githubUsername,
			github_organizations: githubOrgs,
		}, context);
	}

	return {
		github_username: githubUsername,
		github_organizations: githubOrgs,
	};
};
