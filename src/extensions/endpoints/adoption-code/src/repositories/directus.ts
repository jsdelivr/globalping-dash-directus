import type { EndpointExtensionContext } from '@directus/extensions';
import type { AdoptedProbe, Request } from '../index.js';

export const createAdoptedProbe = async (req: Request, probe: AdoptedProbe, context: EndpointExtensionContext) => {
	const { services, database } = context;
	const itemsService = new services.ItemsService('gp_probes', {
		schema: req.schema,
	});

	const name = await getDefaultProbeName(req, probe, context);

	const adoption = {
		ip: probe.ip,
		name,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		hardwareDeviceFirmware: probe.hardwareDeviceFirmware,
		status: probe.status,
		city: probe.city,
		state: probe.state,
		country: probe.country,
		latitude: probe.latitude,
		longitude: probe.longitude,
		asn: probe.asn,
		network: probe.network,
		userId: req.accountability.user,
		lastSyncDate: new Date(),
		isIPv4Supported: probe.isIPv4Supported,
		isIPv6Supported: probe.isIPv6Supported,
	};

	const existingProbe = await database('gp_probes').whereRaw(`
		(
			ip = ?
			OR JSON_CONTAINS(altIps, ?)
		)
		AND userId IS NULL
	`, [ probe.ip, `"${probe.ip}"` ]).first();

	let id: string;

	if (existingProbe) {
		id = await itemsService.updateOne(existingProbe.id, adoption, { emitEvents: false });
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

const getDefaultProbeName = async (req: Request, probe: AdoptedProbe, context: EndpointExtensionContext) => {
	let name = null;
	const namePrefix = probe.country && probe.city ? `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}` : null;

	if (namePrefix) {
		const currentProbes = await findAdoptedProbes({
			userId: req.accountability.user,
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
