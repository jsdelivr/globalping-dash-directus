import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { getDirectusUsers, suspendUser, activateUser, deleteUser } from '../repositories/directus.js';
import { getExistingGithubIds } from '../repositories/github.js';
import type { DirectusUser } from '../types.js';

const SEEDED_USERS = [ '1234567890', '1234567892' ];
const SUSPENSION_PERIOD = 365 * 24 * 60 * 60 * 1000;

export const removeBannedUsers = async (context: OperationContext) => {
	const directusUsers = await getDirectusUsers(context);
	const result = { suspended: [] as string[], activated: [] as string[], deleted: [] as string[] };

	const users = directusUsers.filter(user => !!user.external_identifier && !SEEDED_USERS.includes(user.external_identifier));
	const existingGithubIds = await getExistingGithubIds(users, context);

	await Bluebird.map(users, async (user) => {
		if (!existingGithubIds.has(user.external_identifier)) {
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
	}, { concurrency: 4 });

	return result;
};

const isSuspensionExpired = (user: DirectusUser) => {
	return !!user.suspended_at && Date.now() - new Date(user.suspended_at).getTime() > SUSPENSION_PERIOD;
};
