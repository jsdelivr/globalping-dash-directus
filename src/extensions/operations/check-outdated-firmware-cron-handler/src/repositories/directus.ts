import type { OperationContext } from '@directus/extensions';
import { getFirmwareSubject, getNodeVersionSubject } from '../../../../lib/src/check-firmware-versions.js';

export type AdoptedProbe = {
	id: string;
	ip: string;
	userId: string | null;
	name: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

export const getAlreadyNotifiedProbes = async ({ env, services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const notificationsService = new ItemsService('directus_notifications', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const notifications: { item: string, subject: string }[] = await notificationsService.readByQuery({
		fields: [ 'item', 'subject' ],
		filter: {
			subject: {
				_in: [ getFirmwareSubject(env.TARGET_HW_DEVICE_FIRMWARE), getNodeVersionSubject(env.TARGET_NODE_VERSION) ],
			},
			collection: 'gp_adopted_probes',
		},
	});

	return {
		alreadyNotifiedIdsFirmware: new Set(notifications.filter(({ subject }) => subject === getFirmwareSubject(env.TARGET_HW_DEVICE_FIRMWARE)).map(({ item }) => item)),
		alreadyNotifiedIdsNode: new Set(notifications.filter(({ subject }) => subject === getNodeVersionSubject(env.TARGET_NODE_VERSION)).map(({ item }) => item)),
	};
};


export const getProbesToCheck = async (offsetId: string, { env, database }: OperationContext) => {
	const probes: AdoptedProbe[] = await database('gp_adopted_probes')
		.select('*')
		.whereRaw(`
			(
				(nodeVersion != ? AND nodeVersion IS NOT NULL)
				OR (hardwareDeviceFirmware != ? AND hardwareDeviceFirmware IS NOT NULL)
			)
			AND id > ?
		`, [ env.TARGET_NODE_VERSION, env.TARGET_HW_DEVICE_FIRMWARE, offsetId ])
		.orderBy('id')
		.limit(100);

	return probes;
};
