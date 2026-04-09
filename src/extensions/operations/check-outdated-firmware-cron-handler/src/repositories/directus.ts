import type { OperationContext } from '@directus/extensions';

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

const OUTDATED_PROBE_FILTER = `
	isOutdated = TRUE
	AND userId IS NOT NULL
	AND status != 'offline'
`;

export const getAllUserIdsToCheck = async ({ database }: OperationContext): Promise<string[]> => {
	const rows: { userId: string }[] = await database('gp_probes')
		.distinct('userId')
		.whereRaw(OUTDATED_PROBE_FILTER)
		.orderBy('userId');

	return rows.map(r => r.userId);
};

export const getOutdatedProbesForUsers = async (userId: string, { database }: OperationContext): Promise<AdoptedProbe[]> => {
	return database('gp_probes')
		.select([
			'id',
			'ip',
			'userId',
			'name',
			'hardwareDevice',
			'hardwareDeviceFirmware',
			'nodeVersion',
			'isOutdated',
		])
		.whereRaw(OUTDATED_PROBE_FILTER)
		.where('userId', userId)
		.orderBy('id');
};
