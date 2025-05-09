import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import type { Probe } from '../index.js';

type User = {
	github_username: string | null;
	github_organizations: string[];
};

export const getProbes = async (keys: string[], { services, database, getSchema }: HookExtensionContext, accountability: EventContext['accountability'] = null) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	const currentProbes = await adoptedProbesService.readMany(keys) as Probe[];

	return currentProbes;
};

export const getUser = async (userId: string, accountability: EventContext['accountability'], { services, database, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;
	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema({ database }),
		knex: database,
		accountability,
	});

	const user = await itemsService.readOne(userId) as User | null;
	return user;
};
