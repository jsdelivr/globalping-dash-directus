import type { OperationContext } from '@directus/extensions';

export type AdoptedProbe = {
	id: string;
	ip: string;
	name: string | null;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
	isOutdated: boolean;
};

const OUTDATED_PROBE_FILTER = `
	isOutdated = TRUE
	AND account_id IS NOT NULL
	AND status != 'offline'
`;

export const getAllAccountIdsToCheck = async ({ database }: OperationContext): Promise<string[]> => {
	const rows: { account_id: string }[] = await database('gp_probes')
		.distinct('account_id')
		.whereRaw(OUTDATED_PROBE_FILTER)
		.orderBy('account_id');

	return rows.map(r => r.account_id);
};

export const getOutdatedProbesForAccount = async (accountId: string, { database }: OperationContext): Promise<AdoptedProbe[]> => {
	return database('gp_probes')
		.select([
			'id',
			'ip',
			'name',
			'hardwareDevice',
			'hardwareDeviceFirmware',
			'nodeVersion',
			'isOutdated',
		])
		.whereRaw(OUTDATED_PROBE_FILTER)
		.where('account_id', accountId)
		.orderBy('id');
};
