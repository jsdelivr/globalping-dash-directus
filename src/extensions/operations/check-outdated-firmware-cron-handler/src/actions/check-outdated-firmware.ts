import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { checkFirmwareVersions } from '../../../../lib/src/check-firmware-versions.js';

type AdoptedProbe = {
	id: string;
	ip: string;
	userId: string | null;
	name: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

export const checkOutdatedFirmware = async (context: OperationContext): Promise<string[]> => {
	const probes = getProbesToCheck(context);

	const notifiedProbesIds = await Bluebird.map(probes, async (probe) => {
		if (!probe.userId) {
			return null;
		}

		return checkFirmwareVersions(probe, probe.userId, context);
	}, { concurrency: 4 });

	return notifiedProbesIds.filter((id): id is string => !!id);
};

export const getProbesToCheck = async ({ env, services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes: AdoptedProbe[] = await probesService.readByQuery({
		filter: {
			_or: [{
				_and: [{ nodeVersion: { _neq: env.TARGET_NODE_VERSION } }, { nodeVersion: { _nnull: true } }],
			}, {
				_and: [{ hardwareDeviceFirmware: { _neq: env.TARGET_HW_DEVICE_FIRMWARE } }, { hardwareDeviceFirmware: { _nnull: true } }],
			}],
		},
	});

	return probes;
};
