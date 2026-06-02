import type { EndpointExtensionContext, HookExtensionContext } from '@directus/extensions';
import { getEmailGenerator } from './email-generator.js';

type Context = HookExtensionContext | EndpointExtensionContext;

type User = {
	id: string;
	github_username: string | null;
	github_organizations: string[];
	default_prefix: string | null;
	deprecated_prefix: string | null;
};

export const releaseDeprecatedPrefix = async (username: string, context: Context) => {
	const { services, getSchema } = context;
	const { UsersService } = services;
	const usersService = new UsersService({ schema: await getSchema() });

	await usersService.updateByQuery({
		filter: {
			deprecated_prefix: { _eq: username },
		},
	}, { deprecated_prefix: null });
};

export const checkDefaultPrefix = async (user: User, context: Context): Promise<void> => {
	const { id, github_username: githubUsername, github_organizations: githubOrganizations, default_prefix: defaultPrefix } = user;

	if (!defaultPrefix || !githubUsername) {
		return;
	}

	if ([ githubUsername, ...githubOrganizations ].includes(defaultPrefix)) {
		return;
	}

	const { services, database, getSchema } = context;
	const { UsersService, NotificationsService } = services;
	const schema = await getSchema();

	await releaseDeprecatedPrefix(githubUsername, context);

	const emailGenerator = getEmailGenerator(context);
	const defaultTagChangeLink = emailGenerator.generateDefaultTagChangeLink(id);
	const settingsLink = emailGenerator.generateSettingsLink();

	await database.transaction(async (trx) => {
		const usersService = new UsersService({ schema, knex: trx });
		const notificationsService = new NotificationsService({ schema, knex: trx });

		await usersService.updateOne(id, {
			default_prefix: githubUsername,
			deprecated_prefix: defaultPrefix,
		}, { emitEvents: false });

		await notificationsService.createOne({
			recipient: id,
			type: 'default_tag_change',
			subject: 'Action required: confirm your probe\'s default tag change',
			message: `Your current default probe tag \`u-${defaultPrefix}\` is no longer valid, so it was updated to \`u-${githubUsername}\`.\n\nThe old \`u-${defaultPrefix}\` tag still works for measurement targeting for now. [Confirm the new tag](${defaultTagChangeLink}) to stop using the old one, or [choose a different tag prefix](${settingsLink}) in settings.`,
		});
	});
};
