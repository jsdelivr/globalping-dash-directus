import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import _ from 'lodash';
import { payloadError, type Probe, type Fields } from '../index.js';

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

// New tags always get the name of the owner: the org name or the user's `github_username`.
export const getAccountTagPrefix = async (accountId: string, { database }: HookExtensionContext): Promise<string | null> => {
	const [ rows ] = await database.raw(`
		SELECT COALESCE(o.name, u.github_username) AS prefix
		FROM gp_accounts a
		LEFT JOIN gp_orgs o ON a.org = o.id
		LEFT JOIN directus_users u ON a.user = u.id
		WHERE a.id = :account
	`, { account: accountId }) as [{ prefix: string | null }[]];

	return rows[0]?.prefix ?? null;
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
