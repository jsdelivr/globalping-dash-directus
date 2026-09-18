import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { checkFirmwareVersions, getAlreadyNotifiedProbes } from '../../../../lib/src/check-firmware-versions.js';
import { getAllAccountIdsToCheck, getOutdatedProbesForAccount } from '../repositories/directus.js';

export const checkOutdatedFirmware = async (context: OperationContext): Promise<string[]> => {
	const accountIds = await getAllAccountIdsToCheck(context);
	const alreadyNotified = await getAlreadyNotifiedProbes(context);

	const ids = await Bluebird.map(accountIds, async (accountId) => {
		const probes = await getOutdatedProbesForAccount(accountId, context);
		return checkFirmwareVersions(probes, accountId, context, alreadyNotified);
	}, { concurrency: 4 });

	return ids.flat();
};
