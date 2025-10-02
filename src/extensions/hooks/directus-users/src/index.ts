import { createError } from '@directus/errors';
import { defineHook } from '@directus/extensions-sdk';
import TTLCache from '@isaacs/ttlcache';
import { getDirectusUsers, deleteCreditsAdditions, type DirectusUser } from './repositories/directus.js';
import { validateDefaultPrefix } from './validate-fields.js';

export type Fields = Partial<DirectusUser>;

type Revision = {
	data: DirectusUser;
	delta: DirectusUser;
};

export const UserNotFoundError = createError('UNAUTHORIZED', 'User not found.', 401);

export const deleteUserIdToGithubId = new TTLCache<string, string>({ ttl: 60 * 1000 });

export default defineHook(({ filter, action }, context) => {
	filter('users.update', async (payload, { keys }, { accountability }) => {
		const fields = payload as Fields;

		if (fields.default_prefix) {
			await validateDefaultPrefix(fields.default_prefix, keys, accountability, context);
		}
	});

	filter('users.delete', async (userIds, _payload, { accountability }) => {
		const users = await getDirectusUsers(userIds as string[], accountability, context);
		users.forEach(user => deleteUserIdToGithubId.set(user.id, user.external_identifier));
	});

	action('users.delete', async (payload, { accountability }) => {
		const userIds = (payload.keys as string[]) || [];
		const githubIds = userIds.map(id => deleteUserIdToGithubId.get(id)).filter(Boolean) as string[];
		await deleteCreditsAdditions(githubIds, accountability, context);
	});

	action('users.read', (query) => {
		const payload = query.payload as DirectusUser[];
		payload.forEach((item) => {
			if (item.github_oauth_token) {
				item.github_oauth_token = '********';
			}
		});
	});

	action('revisions.read', (query) => {
		const payload = query.payload as Revision[];
		payload.forEach((item) => {
			if (item.data?.github_oauth_token) {
				item.data.github_oauth_token = '********';
			}

			if (item.delta?.github_oauth_token) {
				item.delta.github_oauth_token = '********';
			}
		});
	});
});
