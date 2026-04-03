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


export const getProbesToCheck = async ({ database }: OperationContext) => {
	const probes: AdoptedProbe[] = await database('gp_probes')
		.select('*')
		.whereRaw(`
			isOutdated = TRUE
			AND userId IS NOT NULL
			AND status != 'offline'
		`)
		.orderBy('userId')
		.orderBy('id');

	return probes;
};
