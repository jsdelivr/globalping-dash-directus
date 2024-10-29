
import type { OperationContext } from '@directus/extensions';
import { getOfflineProbes, getExistingNotifications, notifyProbes, deleteProbes } from '../repositories/directus.js';
import type { AdoptedProbe } from '../types.js';

export const NOTIFY_AFTER_DAYS = 2;
export const REMOVE_AFTER_DAYS = 30;


export const removeExpiredProbes = async (context: OperationContext): Promise<{ notifiedIds: string[], removedIds: string[] }> => {
	const offlineAdoptedProbes = await getOfflineProbes(context);
	const probesToNotify = [];
	const probesToDelete = [];

	for (const probe of offlineAdoptedProbes) {
		if (isExpired(probe.lastSyncDate, REMOVE_AFTER_DAYS)) {
			probesToDelete.push(probe);
		} else if (isExpired(probe.lastSyncDate, NOTIFY_AFTER_DAYS)) {
			probesToNotify.push(probe);
		}
	}

	const probesWithoutNotifications = await excludeAlreadyNotifiedProbes(probesToNotify, context);
	const notifiedIds = await notifyProbes(probesWithoutNotifications, context);
	const removedIds = await deleteProbes(probesToDelete, context);
	return { notifiedIds, removedIds };
};

const excludeAlreadyNotifiedProbes = async (probes: AdoptedProbe[], context: OperationContext) => {
	const probesMap = new Map(probes.map(probe => [ probe.id, probe ]));
	const existingNotifications = await getExistingNotifications(probes, context);
	const notifiedProbeIds = existingNotifications
		.filter((notification) => {
			const probe = probesMap.get(notification.item as string);
			const alreadyNotified = probe && new Date(notification.timestamp) > probe.lastSyncDate;
			return alreadyNotified;
		})
		.map(notification => notification.item);
	return probes.filter(probe => !notifiedProbeIds.includes(probe.id));
};

const isExpired = (date: Date, numberOfDays: number) => {
	const currentDate = new Date();

	const timeDifference = currentDate.getTime() - date.getTime();
	const daysDifference = timeDifference / (24 * 3600 * 1000);

	return daysDifference >= numberOfDays;
};
