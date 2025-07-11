import type { HookExtensionContext } from '@directus/extensions';
import { defineHook } from '@directus/extensions-sdk';
import { generateBytes } from '../../../lib/src/bytes.js';
import { getGithubApiClient } from '../../../lib/src/github-api-client.js';

export type User = {
	provider: string;
	external_identifier: string;
	email?: string | undefined;
	first_name?: string;
	last_name?: string;
	last_page?: string;
	user_type: string;
	github_username?: string;
	github_organizations: string[];
	github_oauth_token: string | null;
	email_notifications: boolean;
	adoption_token?: string;
	default_prefix?: string;
};

type GithubOrgsResponse = {
	login: string;
}[];

type CreditsAdditions = {
	amount: number;
	github_id: string;
	consumed: boolean;
};

export default defineHook(({ filter, action }, context) => {
	// For users without emails, Directus sets `email` to `undefined`, instead of removing that field.
	// That throws on validation here: https://github.com/directus/directus/blob/2991169f82ad5d0c461e82e7fdcb268ef737896c/api/src/services/users.ts#L164-L165
	// Issue should be fixed by Directus, but as a temp solution we are removing that field manually.
	filter('auth.create', async (payload) => {
		const user = payload as User;

		if (!user.email) {
			delete user.email;
		}
	});

	filter('users.create', async (payload) => {
		const user = payload as User;

		if (user.provider === 'github') {
			fulfillUsername(user);
			fulfillFirstNameAndLastName(user);
		}

		user.email_notifications = false;
		user.adoption_token = await generateBytes();
	});

	action('users.create', async (payload) => {
		const userId = payload.key;
		const user = payload.payload as User;

		await Promise.all([
			user.provider === 'github' && fulfillOrganizations(userId, user, context),
			user.provider === 'github' && assignCredits(userId, user, context),
			user.provider === 'github' && fulfillUserType(userId, user, context),
			sendWelcomeNotification(userId, user, context),
		]);
	});
});

const fulfillUsername = (user: User) => {
	const login = user.last_name;
	user.last_name = undefined;
	user.github_username = login;
	user.default_prefix = login;
};

const fulfillFirstNameAndLastName = (user: User) => {
	const login = user.github_username;
	const name = user.first_name;

	if (!name) {
		user.first_name = login;
		return;
	}

	const names = name.split(' ');

	if (names.length > 1) {
		user.first_name = names[0];
		user.last_name = names.slice(1).join(' ');
	}
};

const fulfillOrganizations = async (userId: string, user: User, context: HookExtensionContext) => {
	const client = getGithubApiClient(user.github_oauth_token, context);
	const orgsResponse = await client.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`);
	const githubOrgs = orgsResponse.data.map(org => org.login);

	await updateUser(userId, { github_organizations: githubOrgs }, context);
};

const updateUser = async (userId: string, updateObject: Partial<User>, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { UsersService } = services;

	const usersService = new UsersService({
		schema: await getSchema({ database }),
		knex: database,
	});
	await usersService.updateOne(userId, updateObject);
};

const assignCredits = async (userId: string, user: User, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	await database.transaction(async (trx) => {
		const creditsAdditionsService = new ItemsService('gp_credits_additions', {
			schema: await getSchema({ database }),
			knex: trx,
		});

		const creditsService = new ItemsService('gp_credits', {
			schema: await getSchema({ database }),
			knex: trx,
		});

		const creditsAdditions = await creditsAdditionsService.readByQuery({
			filter: {
				github_id: user.external_identifier,
				consumed: false,
			},
		}) as CreditsAdditions[];

		if (creditsAdditions.length === 0) {
			return;
		}

		const sum = creditsAdditions.reduce((sum, { amount }) => sum + amount, 0);

		await Promise.all([
			creditsAdditionsService.updateByQuery({
				filter: {
					github_id: user.external_identifier,
					consumed: false,
				},
			}, { consumed: true }),
			creditsService.createOne({ amount: sum, user_id: userId }),
		]);
	});
};

const fulfillUserType = async (userId: string, user: User, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { ItemsService } = services;

	const sponsorsService = new ItemsService('sponsors', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const sponsors = await sponsorsService.readByQuery({ filter: { github_id: user.external_identifier } });

	if (sponsors.length > 0) {
		await updateUser(userId, { user_type: 'sponsor' }, context);
	}
};

const sendWelcomeNotification = async (userId: string, _user: User, context: HookExtensionContext) => {
	const { services, database, getSchema } = context;
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: userId,
		subject: 'Welcome to Globalping 🎉',
		message: 'As a registered user, you get 500 free tests per hour. Get more by hosting probes or sponsoring us and supporting the development of the project!',
	});
};
