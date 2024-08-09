import type { AdoptedProbe, Request } from '../index.js';
import type { EndpointExtensionContext } from '@directus/extensions';

export const createAdoptedProbe = async (value: Request, probe: AdoptedProbe, { services }: EndpointExtensionContext) => {
	const itemsService = new services.ItemsService('gp_adopted_probes', {
		schema: value.schema,
	});

	const id = await itemsService.createOne({
		ip: probe.ip,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		status: probe.status,
		city: probe.city,
		state: probe.state,
		country: probe.country,
		latitude: probe.latitude,
		longitude: probe.longitude,
		asn: probe.asn,
		network: probe.network,
		userId: value.accountability.user,
		lastSyncDate: new Date(),
	});

	return id;
};

export const findAdoptedProbe = async (ip: string, { services, getSchema, database }: EndpointExtensionContext) => {
	const itemsService = new services.ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes = await itemsService.readByQuery({
		filter: {
			ip,
		},
	}) as AdoptedProbe[];

	return probes;
};
