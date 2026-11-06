import type { ApiExtensionContext } from '@directus/extensions';
import { getLinkGenerator } from './link-generator.js';
import { sendNotification } from './send-notification.js';

type User = {
	id: string;
	github_username: string | null;
	default_prefix: string | null;
	deprecated_prefix: string | null;
	public_probes: boolean;
};

export const releaseDeprecatedPrefix = async (name: string, context: ApiExtensionContext) => {
	const { services, database, getSchema } = context;
	const { UsersService } = services;
	const usersService = new UsersService({ schema: await getSchema() });

	await Promise.all([
		usersService.updateByQuery({ filter: { deprecated_prefix: { _eq: name } } }, { deprecated_prefix: null }),
		database('gp_orgs').where({ deprecated_prefix: name }).update({ deprecated_prefix: null }),
	]);
};

const getOrgNames = async (userId: string, { database }: ApiExtensionContext): Promise<string[]> => {
	const orgs = await database('gp_org_members')
		.join('gp_orgs', 'gp_orgs.id', 'gp_org_members.org')
		.where('gp_org_members.user', userId)
		.select('gp_orgs.name') as { name: string }[];

	return orgs.map(org => org.name);
};

export const checkDefaultPrefix = async (user: User, context: ApiExtensionContext): Promise<void> => {
	if (!user.default_prefix || !user.github_username) {
		return;
	}

	if (user.default_prefix === user.github_username) {
		return;
	}

	if ((await getOrgNames(user.id, context)).includes(user.default_prefix)) {
		return;
	}

	const { services, database, getSchema } = context;
	const { UsersService } = services;
	const schema = await getSchema();

	await releaseDeprecatedPrefix(user.github_username, context);

	if (!user.public_probes) {
		const usersService = new UsersService({ schema });
		await usersService.updateOne(user.id, { default_prefix: user.github_username }, { emitEvents: false });
		return;
	}

	const defaultTagChangeLink = getLinkGenerator(context).generateDefaultTagChangeLink({ userId: user.id });

	await database.transaction(async (trx) => {
		const usersService = new UsersService({ schema, knex: trx });

		await usersService.updateOne(user.id, {
			default_prefix: user.github_username,
			deprecated_prefix: user.default_prefix,
		}, { emitEvents: false });

		await sendNotification({
			recipient: user.id,
			type: 'default_tag_change',
			subject: 'Action required: Confirm your default probe tag',
			message: `Your default probe tag has been updated from **u-${user.default_prefix}** to **u-${user.github_username}**.\n\nThe old **u-${user.default_prefix}** tag will continue to work for measurement targeting until you [confirm the new tag](${defaultTagChangeLink}).`,
		}, context, trx);
	});
};
