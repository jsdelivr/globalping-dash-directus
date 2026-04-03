import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import _ from 'lodash';
import { checkFirmwareVersions, getAlreadyNotifiedProbes } from '../../../../lib/src/check-firmware-versions.js';
import { getProbesToCheck } from '../repositories/directus.js';

export const checkOutdatedFirmware = async (context: OperationContext): Promise<string[]> => {
	const alreadyNotifiedIds = await getAlreadyNotifiedProbes(context);
	const probes = await getProbesToCheck(context);
	const probesByUserId = _.groupBy(probes, 'userId');
	const ids = await Bluebird.map(Object.entries(probesByUserId), async ([ userId, userProbes ]) => {
		const notNotifiedProbes = userProbes.filter(probe => !alreadyNotifiedIds.has(probe.id));

		if (notNotifiedProbes.length === 0) {
			return [];
		}

		return checkFirmwareVersions(notNotifiedProbes, userId, context);
	}, { concurrency: 4 });

	return ids.flat();
};
