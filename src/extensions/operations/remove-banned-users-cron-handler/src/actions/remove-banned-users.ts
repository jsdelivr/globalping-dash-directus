import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { getDirectusUsers, deleteUser } from '../repositories/directus.js';
import { getGithubUser } from '../repositories/github.js';

export const removeBannedUsers = async (context: OperationContext) => {
	const users = await getDirectusUsers(context);
	const removedIds = await Bluebird.map(users, async (user) => {
		if (!user.external_identifier) {
			return null;
		}

		// Ignore seeded users
		if ([ '1234567890', '1234567892' ].includes(user.external_identifier)) {
			return null;
		}

		const githubUser = await getGithubUser(user, context);

		if (githubUser === null) {
			const id = await deleteUser(user, context);
			return id;
		}

		return null;
	}, { concurrency: 2 });
	return removedIds.filter((id): id is string => !!id);
};
