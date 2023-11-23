import axios from 'axios';
import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';

type GithubUserResponse = {
	login: string;
	id: number;
};

type User = {
	external_identifier?: string;
	github?: string;
}

export default defineHook(({ action }, context) => {
	action('auth.login', async (payload) => {
		const userId = payload.user;
		await syncGithubLogin(userId, context);
	});
});

const syncGithubLogin = async (userId: string, context: HookExtensionContext) => {
	const { services, database, getSchema, env } = context;
	const { ItemsService } = services;

	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const user = await itemsService.readOne(userId) as User | undefined;
	const githubId = user?.external_identifier;
	const username = user?.github;

	if (!user || !githubId || !username) {
		throw new Error('Not enough data to check GitHub username');
	}

	const response = await axios.get<GithubUserResponse>(`https://api.github.com/user/${githubId}`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubUsername = response.data.login;

	if (username !== githubUsername) {
		await sendNotification(userId, username, githubUsername, context);
	}
};

const sendNotification = async (userId: string, username: string, githubUsername: string, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	notificationsService.createOne({
		recipient: userId,
		subject: 'Github username update',
		message: `Looks like your GitHub username was updated from "${username}" to "${githubUsername}". Tags of the adopted probes are constructed as \`u-\${githubUsername}-\${tagValue}\`. If you want tags to use the new value click "Sync GitHub Username" button on the [user page](/admin/users/${userId}).`,
	});
};
