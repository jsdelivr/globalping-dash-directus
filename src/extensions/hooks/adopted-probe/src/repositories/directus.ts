import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import _ from 'lodash';
import { payloadError, type Probe, type Fields } from '../index.js';

type User = {
	github_username: string | null;
	github_organizations: string[];
};

export const getProbes = async (keys: string[], { services, getSchema }: HookExtensionContext, accountability: EventContext['accountability']) => {
	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		schema: await getSchema(),
		accountability,
	});

	const probes = await adoptedProbesService.readMany(keys) as Probe[];

	if (!probes || probes.length === 0) {
		throw payloadError('Adopted probes not found.');
	}

	return probes;
};

export const getUser = async (userId: string, accountability: EventContext['accountability'], { services, getSchema }: HookExtensionContext) => {
	const { ItemsService } = services;
	const itemsService = new ItemsService('directus_users', {
		schema: await getSchema(),
		accountability,
	});

	const user = await itemsService.readOne(userId) as User | null;
	return user;
};

// PHASE5: drop `github_organizations` - a personal account narrows to its owner's `github_username`.
export const getAccountTagPrefixes = async (accountId: string, { database }: HookExtensionContext): Promise<string[]> => {
	const [ rows ] = await database.raw(`
		SELECT o.name AS org_name, u.github_username, u.github_organizations
		FROM gp_accounts a
		LEFT JOIN gp_orgs o ON a.org = o.id
		LEFT JOIN directus_users u ON a.user = u.id
		WHERE a.id = :account
	`, { account: accountId }) as [{ org_name: string | null; github_username: string | null; github_organizations: string | null }[]];

	const owner = rows[0];

	if (owner?.org_name) {
		return [ owner.org_name ];
	}

	if (!owner?.github_username) {
		return [];
	}

	return [ owner.github_username, ...JSON.parse(owner.github_organizations ?? '[]') as string[] ];
};

export const updateProbeWithUserPermissions = async (fields: Fields, keys: string[], accountability: EventContext['accountability'], { services, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		schema: await getSchema(),
		accountability,
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
};

export const updateProbeWithRootPermissions = async (fields: Fields, keys: string[], { services, getSchema }: HookExtensionContext) => {
	if (_.isEmpty(fields)) { return; }

	const { ItemsService } = services;

	const adoptedProbesService = new ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	await adoptedProbesService.updateMany(keys, fields, { emitEvents: false });
};
