import { defineHook } from '@directus/extensions-sdk';
import { HookExtensionContext } from '@directus/types';
import axios from 'axios';

type User = {
    provider: string;
    external_identifier: string;
    first_name?: string;
    last_name?: string;
    last_page?: string;
		user_type: string;
		github_username?: string;
		github_organizations: string[];
}

type GithubOrgsResponse = {
	login: string;
}[];

type CreditsAdditions = {
	amount: number,
	github_id: string,
	consumed: boolean,
};

export default defineHook(({ filter, action }, context) => {
	filter('users.create', async (payload) => {
		const user = payload as User;

		if (user.provider === 'github') {
			fulfillUsername(user);
			fulfillFirstNameAndLastName(user);
		}
	});

	action('users.create', async (payload) => {
		const userId = payload.key;
		const user = payload.payload as User;

		if (user.provider === 'github') {
			await Promise.all([
				fulfillOrganizations(userId, user, context),
				assignCredits(userId, user, context),
				fulfillUserType(userId, user, context),
			]);
		}
	});
});

const fulfillUsername = (user: User) => {
	const login = user.last_name;
	user.last_name = undefined;
	user.github_username = login;
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
	const orgsResponse = await axios.get<GithubOrgsResponse>(`https://api.github.com/user/${user.external_identifier}/orgs`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${context.env.GITHUB_ACCESS_TOKEN}`,
		},
	});
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

		const creditsAdditions = await creditsAdditionsService.readByQuery({ filter: {
			github_id: user.external_identifier,
			consumed: false,
		} }) as CreditsAdditions[];

		if (creditsAdditions.length === 0) {
			return;
		}

		const sum = creditsAdditions.reduce((sum, { amount }) => sum + amount, 0);

		await Promise.all([
			creditsAdditionsService.updateByQuery({ filter: {
				github_id: user.external_identifier,
				consumed: false,
			} }, { consumed: true }),
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
