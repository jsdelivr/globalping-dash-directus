import type { OperationContext } from '@directus/extensions';
import type { Notification } from '@directus/types';
import { OUTDATED_FIRMWARE_NOTIFICATION_TYPE, OUTDATED_SOFTWARE_NOTIFICATION_TYPE } from '../../../../lib/src/check-firmware-versions.js';

export type AdoptedProbe = {
	id: string;
	ip: string;
	userId: string | null;
	name: string | null;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
	isOutdated: boolean;
};

export const getAlreadyNotifiedProbes = async ({ env, services, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const notificationsService = new ItemsService<Notification>('directus_notifications', {
		schema: await getSchema(),
	});

	const existingNotifications = await notificationsService.readByQuery({
		fields: [ 'item' ],
		filter: {
			_or: [
				{
					type: { _eq: OUTDATED_SOFTWARE_NOTIFICATION_TYPE },
					secondary_type: { _eq: env.TARGET_NODE_VERSION },
				},
				{
					type: { _eq: OUTDATED_FIRMWARE_NOTIFICATION_TYPE },
					secondary_type: { _eq: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}` },
				},
			],
		},
	});

	return new Set(existingNotifications.map(({ item }) => item));
};


export const getProbesToCheck = async (offsetId: string, { database }: OperationContext) => {
	const probes: AdoptedProbe[] = await database('gp_probes')
		.select('*')
		.whereRaw(`
			isOutdated = TRUE
			AND userId IS NOT NULL
			AND status != 'offline'
			AND id > ?
		`, [ offsetId ])
		.orderBy('id')
		.limit(100);

	return probes;
};
