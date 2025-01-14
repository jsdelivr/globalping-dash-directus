import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { checkFirmwareVersions } from '../../../../lib/src/check-firmware-versions.js';
import { getAlreadyNotifiedProbes, getProbesToCheck } from '../repositories/directus.js';

export const checkOutdatedFirmware = async (context: OperationContext): Promise<string[]> => {
	const alreadyNotifiedIds = await getAlreadyNotifiedProbes(context);
	const result: string[] = [];
	let offsetId: string | undefined = '';

	do {
		const probes = await getProbesToCheck(offsetId, context);
		const ids = await Bluebird.map(probes, async (probe) => {
			if (!probe.userId) {
				return null;
			}

			if (alreadyNotifiedIds.has(probe.id)) {
				return null;
			}

			return checkFirmwareVersions(probe, probe.userId, context);
		}, { concurrency: 4 });

		result.push(...ids.filter((id): id is string => !!id));
		offsetId = probes.at(-1)?.id;
	} while (offsetId);

	return result;
};
