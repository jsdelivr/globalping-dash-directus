import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { getDirectusUsers, suspendUser, activateUser, deleteUser } from '../repositories/directus.js';
import { getGithubUser } from '../repositories/github.js';
import type { DirectusUser } from '../types.js';

const SEEDED_USERS = [ '1234567890', '1234567892' ];
const SUSPENSION_PERIOD = 365 * 24 * 60 * 60 * 1000;

export const removeBannedUsers = async (context: OperationContext) => {
	const users = await getDirectusUsers(context);
	const result = { suspended: [] as string[], activated: [] as string[], deleted: [] as string[] };

	await Bluebird.map(users, async (user) => {
		if (!user.external_identifier || SEEDED_USERS.includes(user.external_identifier)) {
			return;
		}

		const githubUser = await getGithubUser(user, context);

		if (githubUser === null) {
			// Suspend a freshly banned user, delete it once the suspension has lasted long enough.
			if (user.status !== 'suspended') {
				await suspendUser(user, context);
				result.suspended.push(user.id);
			} else if (isSuspensionExpired(user)) {
				await deleteUser(user, context);
				result.deleted.push(user.id);
			}
		} else if (user.status === 'suspended') {
			await activateUser(user, context);
			result.activated.push(user.id);
		}
	}, { concurrency: 2 });

	return result;
};

const isSuspensionExpired = (user: DirectusUser) => {
	return !!user.date_updated && Date.now() - new Date(user.date_updated).getTime() > SUSPENSION_PERIOD;
};
