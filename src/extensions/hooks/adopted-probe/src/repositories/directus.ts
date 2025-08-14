import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import _ from 'lodash';
import { payloadError, type Probe, type Fields } from '../index.js';

type User = {
	github_username: string | null;
	github_organizations: string[];
};

export const getProbes = async (keys: string[], { services, database, getSchema }: HookExtensionContext, accountability: EventContext['accountability']) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	const probes = await adoptedProbesService.readMany(keys) as Probe[];

	if (!probes || probes.length === 0) {
		throw payloadError('Adopted probes not found.');
	}

	return probes;
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

export const updateProbeWithUserPermissions = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], { services, database, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
		accountability,
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
};

export const updateProbeWithRootPermissions = async (fields: Fields, keys: string[], { services, database, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		database,
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
};
