import type { EndpointExtensionContext, HookExtensionContext } from '@directus/extensions';
import { getLinkGenerator } from './link-generator.js';

type Context = HookExtensionContext | EndpointExtensionContext;

type User = {
	id: string;
	github_username: string | null;
	github_organizations: string[];
	default_prefix: string | null;
	deprecated_prefix: string | null;
	public_probes: boolean;
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
	if (!user.default_prefix || !user.github_username) {
		return;
	}

	if ([ user.github_username, ...user.github_organizations ].includes(user.default_prefix)) {
		return;
	}

	const { services, database, getSchema } = context;
	const { UsersService, NotificationsService } = services;
	const schema = await getSchema();

	await releaseDeprecatedPrefix(user.github_username, context);

	if (!user.public_probes) {
		const usersService = new UsersService({ schema });
		await usersService.updateOne(user.id, { default_prefix: user.github_username }, { emitEvents: false });
		return;
	}

	const linkGenerator = getLinkGenerator(context);
	const defaultTagChangeLink = linkGenerator.generateDefaultTagChangeLink(user.id);
	const settingsLink = linkGenerator.generateSettingsLink();

	await database.transaction(async (trx) => {
		const usersService = new UsersService({ schema, knex: trx });
		const notificationsService = new NotificationsService({ schema, knex: trx });

		await usersService.updateOne(user.id, {
			default_prefix: user.github_username,
			deprecated_prefix: user.default_prefix,
		}, { emitEvents: false });

		await notificationsService.createOne({
			recipient: user.id,
			type: 'default_tag_change',
			subject: 'Action required: confirm your probe\'s default tag change',
			message: `Your current default probe tag \`u-${user.default_prefix}\` is no longer valid, so it was updated to \`u-${user.github_username}\`.\n\nThe old \`u-${user.default_prefix}\` tag still works for measurement targeting for now. [Confirm the new tag](${defaultTagChangeLink}) to stop using the old one, or [choose a different tag prefix](${settingsLink}) in settings.`,
		});
	});
};
