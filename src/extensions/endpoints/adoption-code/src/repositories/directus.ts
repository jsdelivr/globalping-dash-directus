import type { EndpointExtensionContext } from '@directus/extensions';
import type { AdoptedProbe, Request } from '../index.js';

export const createAdoptedProbe = async (req: Request, probe: AdoptedProbe, context: EndpointExtensionContext) => {
	const { services } = context;
	const itemsService = new services.ItemsService('gp_adopted_probes', {
		schema: req.schema,
	});

	const name = await getDefaultProbeName(req, probe, context);

	const id = await itemsService.createOne({
		ip: probe.ip,
		name,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		status: probe.status,
		city: probe.city,
		systemTags: probe.systemTags,
		state: probe.state,
		country: probe.country,
		latitude: probe.latitude,
		longitude: probe.longitude,
		asn: probe.asn,
		network: probe.network,
		userId: req.accountability.user,
		lastSyncDate: new Date(),
	});

	return [ id, name ];
};

export const findAdoptedProbes = async (filter: Record<string, unknown>, { services, getSchema, database }: EndpointExtensionContext) => {
	const itemsService = new services.ItemsService('gp_adopted_probes', {
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
