import type { OperationContext } from '@directus/extensions';
import { getDirectusUsers, suspendUsers, activateUsers, deleteUsers } from '../repositories/directus.js';
import { getExistingGithubIds } from '../repositories/github.js';
import type { DirectusUser } from '../types.js';

const SEEDED_USERS = [ '1234567890', '1234567892' ];
const SUSPENSION_PERIOD = 365 * 24 * 60 * 60 * 1000;

export const removeBannedUsers = async (context: OperationContext) => {
	const directusUsers = await getDirectusUsers(context);
	const users = directusUsers.filter(user => !!user.external_identifier && !SEEDED_USERS.includes(user.external_identifier));
	const existingGithubIds = await getExistingGithubIds(users, context);

	const toSuspend: DirectusUser[] = [];
	const toActivate: DirectusUser[] = [];
	const toDelete: DirectusUser[] = [];

	users.forEach((user) => {
		if (!existingGithubIds.has(user.external_identifier)) {
			if (user.status !== 'suspended') {
				toSuspend.push(user);
			} else if (isSuspensionExpired(user)) {
				toDelete.push(user);
			}
		} else if (user.status === 'suspended') {
			toActivate.push(user);
		}
	});

	await suspendUsers(toSuspend, context);
	await activateUsers(toActivate, context);
	await deleteUsers(toDelete, context);

	return {
		suspended: toSuspend.map(user => user.id),
		activated: toActivate.map(user => user.id),
		deleted: toDelete.map(user => user.id),
	};
};

const isSuspensionExpired = (user: DirectusUser) => {
	return !!user.suspended_at && Date.now() - new Date(user.suspended_at).getTime() > SUSPENSION_PERIOD;
};
