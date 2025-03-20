import type { EndpointExtensionContext } from '@directus/extensions';
import type { AdoptedProbe } from '../index.js';

export const createAdoptedProbe = async (userId: string, probe: AdoptedProbe, context: EndpointExtensionContext) => {
	const { services, database, getSchema } = context;
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const name = await getDefaultProbeName(userId, probe, context);

	const adoption = {
		ip: probe.ip,
		name,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		hardwareDeviceFirmware: probe.hardwareDeviceFirmware,
		systemTags: probe.systemTags,
		status: probe.status,
		city: probe.city,
		state: probe.state,
		country: probe.country,
		latitude: probe.latitude,
		longitude: probe.longitude,
		asn: probe.asn,
		network: probe.network,
		userId,
		lastSyncDate: new Date(),
		isIPv4Supported: probe.isIPv4Supported,
		isIPv6Supported: probe.isIPv6Supported,
	};

	const existingProbe = await database('gp_probes')
		.where({ uuid: probe.uuid })
		.orWhere({ ip: probe.ip })
		.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ probe.ip ])
		.first();

	let id: string;

	if (existingProbe) {
		id = await itemsService.updateOne(existingProbe.id, {
			name: adoption.name,
			userId: adoption.userId,
			tags: '[]',
			isCustomCity: false,
			countryOfCustomCity: null,
		}, { emitEvents: false });
	} else {
		id = await itemsService.createOne(adoption, { emitEvents: false });
	}

	return [ id, name ] as const;
};

const findAdoptedProbes = async (filter: Record<string, unknown>, { services, getSchema, database }: EndpointExtensionContext) => {
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes = await itemsService.readByQuery({
		filter,
	}) as AdoptedProbe[];

	return probes;
};

const getDefaultProbeName = async (userId: string, probe: AdoptedProbe, context: EndpointExtensionContext) => {
	let name = null;
	const namePrefix = probe.country && probe.city ? `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}` : null;

	if (namePrefix) {
		const currentProbes = await findAdoptedProbes({
			userId,
			country: probe.country,
			city: probe.city,
		}, context);
		name = `${namePrefix}-${(currentProbes.length + 1).toString().padStart(2, '0')}`;
	}

	return name;
};

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
