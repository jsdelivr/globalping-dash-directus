import type { OperationContext } from '@directus/extensions';
import { OUTDATED_FIRMWARE_NOTIFICATION_TYPE, OUTDATED_SOFTWARE_NOTIFICATION_TYPE } from '../../../../lib/src/check-firmware-versions.js';

export type AdoptedProbe = {
	id: string;
	ip: string;
	userId: string | null;
	name: string | null;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

export const getAlreadyNotifiedProbes = async ({ env, services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const notificationsService = new ItemsService('directus_notifications', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const existingNotifications: { item: string }[] = await notificationsService.readByQuery({
		fields: [ 'item' ],
		filter: {
			_or: [
				{
					type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
					secondary_type: env.TARGET_NODE_VERSION,
				},
				{
					type: OUTDATED_FIRMWARE_NOTIFICATION_TYPE,
					secondary_type: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}`,
				},
			],
		},
	});

	return new Set(existingNotifications.map(({ item }) => item));
};


export const getProbesToCheck = async (offsetId: string, { env, database }: OperationContext) => {
	const probes: AdoptedProbe[] = await database('gp_probes')
		.select('*')
		.whereRaw(`
			(
				(nodeVersion != ? AND nodeVersion IS NOT NULL)
				OR (hardwareDeviceFirmware != ? AND hardwareDevice IS NOT NULL)
			)
			AND userId IS NOT NULL
			AND status != 'offline'
			AND id > ?
		`, [ env.TARGET_NODE_VERSION, env.TARGET_HW_DEVICE_FIRMWARE, offsetId ])
		.orderBy('id')
		.limit(100);

	return probes;
};
