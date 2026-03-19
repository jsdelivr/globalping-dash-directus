import type { EndpointExtensionContext } from '@directus/extensions';

export const findAdoptedProbeByIp = async (ip: string, { database }: EndpointExtensionContext) => {
	const probe = await database('gp_probes').whereRaw(`
			(
				ip = ?
				OR JSON_CONTAINS(altIps, ?)
			)
			AND userId IS NOT NULL
	`, [ ip, `"${ip}"` ]).first();

	return probe;
};
