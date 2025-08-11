import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import _ from 'lodash';
import type { Probe, Fields } from '../index.js';

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

export const updateProbeWithRootPermissions = async (fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	console.log('updateProbeWithRootPermissions', fields, keys);
	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
	console.log('updateProbeWithRootPermissions done');
};

export const updateProbeWithUserPermissions = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], { services, database, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	console.log('updateProbeWithUserPermissions', fields, keys, accountability);
	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
	console.log('updateProbeWithUserPermissions done');
};
