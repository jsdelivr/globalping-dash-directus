import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { checkFirmwareVersions, getAlreadyNotifiedProbes } from '../../../../lib/src/check-firmware-versions.js';
import { getAllUserIdsToCheck, getOutdatedProbesForUsers } from '../repositories/directus.js';

export const checkOutdatedFirmware = async (context: OperationContext): Promise<string[]> => {
	const userIds = await getAllUserIdsToCheck(context);
	const alreadyNotifiedIds = await getAlreadyNotifiedProbes(context);

	const ids = await Bluebird.map(userIds, async (userId) => {
		const probes = await getOutdatedProbesForUsers(userId, context);
		const notNotified = probes.filter(p => !alreadyNotifiedIds.has(p.id));
		return notNotified.length === 0 ? [] : checkFirmwareVersions(notNotified, userId, context);
	}, { concurrency: 8 });

	return ids.flat();
};
